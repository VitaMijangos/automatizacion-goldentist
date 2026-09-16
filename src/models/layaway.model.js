/* =====================================================================
   MODELO — Apartados (layaways)
   ---------------------------------------------------------------------
   Datos, reglas de negocio y acceso a la base de datos de la sección
   "Apartados". Esta capa NO genera HTML ni toca el DOM — eso es trabajo
   de la Vista (src/views/layaway.view.js). El Controlador
   (src/controllers/layaway.controller.js) es el único que llama a estas
   funciones y decide qué hacer con el resultado.

   Por qué separar esto en su propio archivo: el día que se migre la base
   de datos de Supabase a MySQL (con un backend propio, ver
   GUIA_DESPLIEGUE.md), el cambio real solo debería tocar el objeto
   `LayawayRepo` de aquí abajo — la Vista y el Controlador no deberían
   necesitar ni un cambio, porque ya no hablan directo con Supabase.
   ===================================================================== */

/* ---------- vocabulario / colores de estatus ---------- */
var LAYAWAY_STATUS_COLOR = { apartado: '#3a7bd5', pendiente: '#c9820a', completado: '#2a9d5c' };
var LAYAWAY_STATUS_LABEL = { apartado: 'Apartado', pendiente: 'Pendiente', completado: 'Completado' };
function layawayStatusLabel(status){ return LAYAWAY_STATUS_LABEL[status] || status; }
function layawayStatusColor(status){ return LAYAWAY_STATUS_COLOR[status] || '#8a8a8a'; }

/* ---------- mapeo: fila de Supabase -> objeto de dominio ---------- */
function rowToLayaway(r){
  return {
    id: r.id, customerName: r.customer_name || '', phone: r.phone || '',
    product: r.product || '', qty: r.qty, date: r.date,
    totalAmount: Number(r.total_amount) || 0, depositMethod: r.deposit_method || '',
    status: r.status || 'apartado', settlePaymentMethod: r.settle_payment_method || '',
    settleDate: r.settle_date || '', notes: r.notes || '',
    payments: [] // se llena en loadState() con los abonos de layaway_payments
  };
}
function rowToPayment(r){
  return { id: r.id, layawayId: r.layaway_id, amount: Number(r.amount) || 0, date: r.date || '', note: r.note || '' };
}

/* ---------- cálculos derivados (reglas de negocio) ---------- */
function layawayAbonado(l){ return sumField(l.payments, 'amount'); }
function layawayRestante(l){ return l.totalAmount - layawayAbonado(l); }
// Considerado liquidado también si se abonó de más por error de captura
// (restante negativo) — no tiene caso pedir más abonos en ese caso.
function layawayIsLiquidado(l){ return layawayRestante(l) <= 0.005; }

/* ---------- filtrado (recibe una lista, regresa una lista filtrada) ---------- */
function layawaysByStatusFilter(list, filter){
  return (filter === 'abiertos') ? list.filter(function(l){ return l.status !== 'completado'; }) : list;
}
function layawaysByDateRange(list, from, to){
  if(!from && !to) return list;
  return list.filter(function(l){
    return (!from || l.date >= from) && (!to || l.date <= to);
  });
}

/* ---------- exportar CSV (transformación de datos, no HTML) ---------- */
function exportLayawaysCsv(list, filename){
  var headers = ['Fecha','Cliente','Teléfono','Producto','Cantidad','Monto total','Abonado','Restante','Forma de apartado','Estatus','Forma de pago liquidado','Fecha de liquidación','Notas'];
  var rows = sortedByDate(list).map(function(l){
    return [l.date, l.customerName, l.phone, l.product, l.qty, l.totalAmount.toFixed(2), layawayAbonado(l).toFixed(2), layawayRestante(l).toFixed(2), l.depositMethod, layawayStatusLabel(l.status), l.settlePaymentMethod, l.settleDate, l.notes];
  });
  downloadCsv(filename, headers, rows);
}

/* ---------- acceso a datos (repositorio sobre Supabase) ----------
   Todas las llamadas a `supabaseClient` para "layaways"/"layaway_payments"
   viven únicamente aquí. El Controlador nunca llama a supabaseClient
   directamente para esta sección — solo a través de LayawayRepo. */
var LayawayRepo = {
  getById: function(id){
    return STATE.layaways.filter(function(x){ return x.id === id; })[0] || null;
  },

  /* Crea el apartado y, si trae depósito inicial, su primer abono — son
     dos inserts encadenados porque el abono necesita el id que genera el
     primer insert. No usa el helper genérico `addRow` (pensado para un
     solo insert) por eso mismo. */
  create: function(fields, opts){
    opts = opts || {};
    if(SAVING) return;
    SAVING = true; render();
    pgCall(supabaseClient.from('layaways').insert({
      customer_name: fields.customerName, phone: fields.phone, product: fields.product, qty: fields.qty, date: fields.date,
      total_amount: fields.total, deposit_method: fields.depositMethod, status: 'apartado', notes: fields.notes
    }).select()).then(function(rows){
      var newId = rows && rows[0] && rows[0].id;
      if(newId && fields.deposit > 0){
        return pgCall(supabaseClient.from('layaway_payments').insert({ layaway_id: newId, amount: fields.deposit, date: fields.date, note: 'Depósito inicial' }));
      }
    }).then(function(){
      return loadState();
    }).then(function(){
      SAVING = false; render();
      if(opts.onSuccess) opts.onSuccess();
    }).catch(function(err){
      SAVING = false; render();
      toast(friendlyError(err, 'No se pudo registrar el apartado.'));
    });
  },

  addPayment: function(layawayId, payment, opts){
    addRow('layaway_payments', { layaway_id: layawayId, amount: payment.amount, date: payment.date || null, note: payment.note }, opts);
  },
  deletePayment: function(paymentId, opts){
    deleteRow('layaway_payments', paymentId, opts);
  },
  update: function(id, payload, opts){
    updateRow('layaways', id, payload, opts);
  },
  remove: function(id, opts){
    deleteRow('layaways', id, opts);
  }
};
