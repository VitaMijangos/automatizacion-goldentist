/* =====================================================================
   CONTROLADOR — Apartados (layaways)
   ---------------------------------------------------------------------
   `renderApartados()` es el punto de entrada que llama el router de
   pestañas en render() (src/core.js) cuando CURRENT_TAB === 'apartados'.
   Su trabajo: leer el estado actual (STATE + qué filtros están activos),
   pedirle al Modelo los datos ya filtrados, pedirle a la Vista el HTML
   correspondiente, ponerlo en el DOM, y conectar los eventos de la
   pantalla — que a su vez llaman de vuelta al Modelo (LayawayRepo) y
   vuelven a pintar. Aquí es donde vive el "pegamento" entre Modelo y
   Vista; ni uno ni otro deberían necesitar tocarse si solo cambia cómo
   se orquesta una acción.
   ===================================================================== */

/* Filtros activos de la pantalla — es estado de "qué se está mostrando
   ahorita", no un dato del negocio, por eso vive en el Controlador y no
   en el Modelo. */
var LAYAWAY_FILTER = 'abiertos'; // 'abiertos' (apartado+pendiente) o 'todos'
var LAYAWAY_DATE_FROM = null; // 'AAAA-MM-DD' o null — límite inferior del filtro de fecha de Apartados (inclusivo)
var LAYAWAY_DATE_TO = null; // 'AAAA-MM-DD' o null — límite superior del filtro de fecha de Apartados (inclusivo)
var LAYAWAY_YEAR_EXPANDED = null; // 'AAAA' -> bool, año más reciente abierto por default
var LAYAWAY_MONTH_EXPANDED = null; // 'AAAA-MM' -> bool, mes más reciente abierto por default

function renderApartados(){
  var view = $('#view-apartados');
  var sorted = STATE.layaways.slice().sort(function(a,b){
    if(a.date === b.date) return (b.id > a.id) ? 1 : -1;
    return a.date < b.date ? 1 : -1;
  });
  var statusScoped = layawaysByStatusFilter(sorted, LAYAWAY_FILTER);
  // Mismo filtro Desde/Hasta que Envíos: un solo día (Desde=Hasta), un
  // rango (por ejemplo un mes completo), o cualquiera de los dos límites
  // abierto. Ambos límites son inclusivos.
  var hasDateFilter = !!(LAYAWAY_DATE_FROM || LAYAWAY_DATE_TO);
  var scoped = layawaysByDateRange(statusScoped, LAYAWAY_DATE_FROM, LAYAWAY_DATE_TO);

  // Mismo criterio que Ventas/Mensajes/Envíos (ver core.js): con un filtro
  // de fecha activo se muestra una sola tabla plana sin agrupar; sin él,
  // el listado completo (ya no solo los 20 más recientes) se agrupa en un
  // acordeón Año > Mes, con solo el año/mes más reciente abierto por
  // default. El año/mes por default se calcula sobre `sorted` (la lista
  // completa sin el filtro Abiertos/Todos) y no sobre `statusScoped`, para
  // no repetir el bug ya corregido en Envíos/Ventas: si el filtro activo
  // en el primer render da cero resultados, el cálculo no debe quedar
  // fijo en "todo colapsado" para siempre.
  var groupsHtml;
  if(hasDateFilter){
    groupsHtml = scoped.length ? ('<div class="card">'+layawayTableHtml(scoped)+'</div>')
      : '<div class="card"><div class="empty">No hay apartados en ese rango de fechas.</div></div>';
  } else {
    if(LAYAWAY_YEAR_EXPANDED === null){
      LAYAWAY_YEAR_EXPANDED = {};
      LAYAWAY_MONTH_EXPANDED = {};
      var firstLayawayYearGroups = groupByYear(sorted);
      if(firstLayawayYearGroups.length){
        LAYAWAY_YEAR_EXPANDED[firstLayawayYearGroups[0].year] = true;
        if(firstLayawayYearGroups[0].months.length) LAYAWAY_MONTH_EXPANDED[firstLayawayYearGroups[0].months[0].key] = true;
      }
    }
    groupsHtml = yearMonthAccordionHtml(
      statusScoped, LAYAWAY_YEAR_EXPANDED, LAYAWAY_MONTH_EXPANDED,
      'toggle-layaway-year', 'toggle-layaway-month', layawayTableHtml, 'apartado',
      (LAYAWAY_FILTER==='abiertos' ? 'No hay apartados abiertos.' : 'Aún no hay apartados registrados.')
    );
  }

  view.innerHTML = renderApartadosViewHtml({
    saving: SAVING,
    filter: LAYAWAY_FILTER,
    hasDateFilter: hasDateFilter,
    dateFrom: LAYAWAY_DATE_FROM,
    dateTo: LAYAWAY_DATE_TO,
    dateLabel: hasDateFilter ? dateRangeFilterLabel(LAYAWAY_DATE_FROM, LAYAWAY_DATE_TO) : '',
    groupsHtml: groupsHtml
  });

  $('#l-date').value = todayISO();

  $('#layaway-form').addEventListener('submit', function(e){
    e.preventDefault();
    var customerName = $('#l-customerName').value.trim();
    var product = $('#l-product').value.trim();
    var qty = parseInt($('#l-qty').value, 10) || 1;
    var date = $('#l-date').value;
    var total = parseFloat($('#l-total').value);
    var deposit = parseFloat($('#l-deposit').value) || 0;
    var depositMethod = $('#l-depositMethod').value.trim();
    var phone = $('#l-phone').value.trim();
    var notes = $('#l-notes').value.trim();
    if(!customerName || !product || !date || isNaN(total) || total <= 0){
      toast('Completa cliente, producto, fecha y monto total.');
      return;
    }
    LayawayRepo.create({
      customerName: customerName, phone: phone, product: product, qty: qty, date: date,
      total: total, deposit: deposit, depositMethod: depositMethod, notes: notes
    }, {
      onSuccess: function(){
        // el año y el mes del apartado recién creado se abren automáticamente
        // para verlo, mismo motivo que Ventas/Mensajes/Envíos: runMutation ya
        // llamó a render() antes de este callback, así que hay que volver a
        // renderizar para que el grupo recién abierto se vea sin un clic extra.
        if(LAYAWAY_YEAR_EXPANDED) LAYAWAY_YEAR_EXPANDED[date.slice(0,4)] = true;
        if(LAYAWAY_MONTH_EXPANDED) LAYAWAY_MONTH_EXPANDED[date.slice(0,7)] = true;
        toast('Apartado registrado');
        renderApartados();
      }
    });
  });

  $all('[data-layaway-filter]').forEach(function(btn){
    btn.addEventListener('click', function(){ LAYAWAY_FILTER = btn.getAttribute('data-layaway-filter'); renderApartados(); });
  });

  $all('[data-toggle-layaway-year]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var y = btn.getAttribute('data-toggle-layaway-year');
      LAYAWAY_YEAR_EXPANDED[y] = !LAYAWAY_YEAR_EXPANDED[y];
      renderApartados();
    });
  });
  $all('[data-toggle-layaway-month]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var k = btn.getAttribute('data-toggle-layaway-month');
      LAYAWAY_MONTH_EXPANDED[k] = !LAYAWAY_MONTH_EXPANDED[k];
      renderApartados();
    });
  });

  $('#layaway-date-filter-apply').addEventListener('click', function(){
    var from = $('#layaway-date-from').value || null;
    var to = $('#layaway-date-to').value || null;
    if(from && to && from > to){
      toast('"Desde" no puede ser una fecha posterior a "Hasta".');
      return;
    }
    LAYAWAY_DATE_FROM = from;
    LAYAWAY_DATE_TO = to;
    renderApartados();
  });
  if($('#layaway-date-filter-clear')){
    $('#layaway-date-filter-clear').addEventListener('click', function(){
      LAYAWAY_DATE_FROM = null;
      LAYAWAY_DATE_TO = null;
      renderApartados();
    });
  }

  $('#export-apartados-csv').addEventListener('click', function(){
    exportLayawaysCsv(scoped, 'apartados_goldentist_'+todayISO()+'.csv');
  });

  $all('[data-del-layaway]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = Number(btn.getAttribute('data-del-layaway'));
      confirmModal('¿Eliminar este apartado y todos sus abonos?', function(){
        LayawayRepo.remove(id, { errorMsg: 'No se pudo eliminar. Intenta de nuevo.' });
      });
    });
  });

  $all('[data-view-layaway]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = Number(btn.getAttribute('data-view-layaway'));
      var l = LayawayRepo.getById(id);
      if(!l){ toast('Ese apartado ya no existe.'); return; }
      openLayawayModal(l);
    });
  });
}

function openLayawayModal(l){
  openModal(
    layawayModalHtml(l, SAVING),
    function(){
      $('#edit-layaway-cancel').addEventListener('click', closeModal);

      $('#lp-add').addEventListener('click', function(){
        var amount = parseFloat($('#lp-amount').value);
        var date = $('#lp-date').value;
        var note = $('#lp-note').value.trim();
        if(isNaN(amount) || amount <= 0){ toast('Escribe un monto válido.'); return; }
        // No se cierra el modal: se vuelve a abrir con los datos frescos
        // (abonado/restante ya recalculados) en cuanto termina la mutación,
        // para poder seguir registrando abonos seguidos sin perder el lugar.
        LayawayRepo.addPayment(l.id, { amount: amount, date: date, note: note }, {
          errorMsg: 'No se pudo agregar el abono.',
          onSuccess: function(){
            toast('Abono agregado');
            var fresh = LayawayRepo.getById(l.id);
            if(fresh) openLayawayModal(fresh); else closeModal();
          }
        });
      });

      $all('[data-del-payment]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var pid = Number(btn.getAttribute('data-del-payment'));
          LayawayRepo.deletePayment(pid, {
            errorMsg: 'No se pudo quitar el abono.',
            onSuccess: function(){
              toast('Abono quitado');
              var fresh = LayawayRepo.getById(l.id);
              if(fresh) openLayawayModal(fresh); else closeModal();
            }
          });
        });
      });

      $('#edit-layaway-save').addEventListener('click', function(){
        var customerName = $('#el-customerName').value.trim();
        var product = $('#el-product').value.trim();
        var total = parseFloat($('#el-total').value);
        if(!customerName || !product || isNaN(total) || total <= 0){
          $('#edit-layaway-err').textContent = 'Completa cliente, producto y monto total.';
          return;
        }
        var payload = {
          customer_name: customerName, phone: $('#el-phone').value.trim(),
          product: product, total_amount: total, status: $('#el-status').value,
          deposit_method: $('#el-depositMethod').value.trim(),
          settle_payment_method: $('#el-settlePaymentMethod').value.trim(),
          settle_date: $('#el-settleDate').value || null,
          notes: $('#el-notes').value.trim()
        };
        closeModal();
        LayawayRepo.update(l.id, payload, {
          errorMsg: 'No se pudo actualizar. Intenta de nuevo.',
          onSuccess: function(){ toast('Apartado actualizado'); }
        });
      });
    },
    { maxWidth: '720px' }
  );
}
