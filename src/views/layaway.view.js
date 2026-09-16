/* =====================================================================
   VISTA — Apartados (layaways)
   ---------------------------------------------------------------------
   Funciones "puras": reciben datos ya calculados/filtrados como
   parámetros y devuelven HTML como texto. No leen variables globales de
   estado (STATE, qué filtro está activo, etc.) ni tocan el DOM — eso es
   trabajo del Controlador (src/controllers/layaway.controller.js), que
   junta los datos y llama a estas funciones.

   Sí pueden llamar a funciones de solo lectura del Modelo
   (layawayAbonado, layawayRestante, layawayStatusLabel/Color,
   layawayIsLiquidado) porque son cálculos derivados de los datos que ya
   recibieron como parámetro, no un acceso a estado global ni a la red —
   es exactamente lo que en MVC hace la Vista al "leer" el Modelo.
   ===================================================================== */

function layawayFormHtml(saving){
  return '<div class="card">'+
    '<h2>Nuevo apartado</h2>'+
    '<p class="hint" style="margin-top:-6px">Para un cliente que deja un anticipo y liquidará el resto después.</p>'+
    '<form id="layaway-form">'+
      '<div class="grid2">'+
        '<div class="field"><label>Cliente</label><input type="text" id="l-customerName" required></div>'+
        '<div class="field"><label>Teléfono</label><input type="text" id="l-phone"></div>'+
      '</div>'+
      '<div class="grid3">'+
        '<div class="field"><label>Producto</label><input type="text" id="l-product" required></div>'+
        '<div class="field"><label>Cantidad</label><input type="number" min="1" step="1" id="l-qty" value="1"></div>'+
        '<div class="field"><label>Fecha</label><input type="date" id="l-date" required></div>'+
      '</div>'+
      '<div class="grid3">'+
        '<div class="field"><label>Monto total</label><input type="number" min="0" step="0.01" id="l-total" required></div>'+
        '<div class="field"><label>Depósito inicial</label><input type="number" min="0" step="0.01" id="l-deposit" value="0"></div>'+
        '<div class="field"><label>Forma de apartado</label><input type="text" id="l-depositMethod" placeholder="Transferencia, OXXO…"></div>'+
      '</div>'+
      '<div class="field"><label>Notas</label><input type="text" id="l-notes"></div>'+
      '<button class="btn" type="submit" style="margin-top:14px" '+(saving?'disabled':'')+'>Registrar apartado</button>'+
    '</form>'+
  '</div>';
}

function layawayRowHtml(l){
  return '<tr>'+
    '<td>'+escapeHtml(fmtDateShort(l.date))+'</td>'+
    '<td>'+escapeHtml(l.customerName)+'</td>'+
    '<td>'+escapeHtml(l.product)+'</td>'+
    '<td>$'+l.totalAmount.toFixed(2)+'</td>'+
    '<td>$'+layawayAbonado(l).toFixed(2)+'</td>'+
    '<td>$'+layawayRestante(l).toFixed(2)+'</td>'+
    '<td>'+statusPillHtml(layawayStatusLabel(l.status), layawayStatusColor(l.status))+'</td>'+
    '<td style="white-space:nowrap">'+
      '<button class="btn secondary small" data-view-layaway="'+escapeHtml(l.id)+'" type="button">Ver / abonar</button> '+
      '<button class="btn danger small" data-del-layaway="'+escapeHtml(l.id)+'" type="button">Eliminar</button>'+
    '</td>'+
  '</tr>';
}

/* Tabla sola (encabezado + filas), reutilizada tanto por la vista plana
   (con un filtro de fecha activo) como por cada mes abierto del acordeón
   año/mes de abajo — mismo patrón que salesTableHtml/msgTableHtml/
   shipmentsTableHtml en core.js. */
function layawayTableHtml(items){
  var rowsHtml = items.map(layawayRowHtml).join('');
  return '<div style="overflow-x:auto"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Total</th><th>Abonado</th><th>Restante</th><th>Estatus</th><th></th></tr></thead>'+
    '<tbody>'+rowsHtml+'</tbody></table></div>';
}

/* Encabezado + filtros de la pantalla de Apartados (título, botones
   Abiertos/Todos, buscador Desde/Hasta). No arma la tabla ni el acordeón
   — eso lo decide el Controlador según haya o no un filtro de fecha
   activo (mismo criterio que Envíos en core.js) y se pasa ya armado en
   params.groupsHtml. */
/* params: { filter, hasDateFilter, dateFrom, dateTo, dateLabel, groupsHtml } */
function layawayListHeaderHtml(params){
  return '<div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'+
      '<h2 style="margin:0">Apartados</h2>'+
      '<div class="row" style="gap:6px">'+
        '<button class="btn '+(params.filter==='abiertos'?'':'secondary')+' small" data-layaway-filter="abiertos" type="button">Abiertos</button>'+
        '<button class="btn '+(params.filter==='todos'?'':'secondary')+' small" data-layaway-filter="todos" type="button">Todos</button>'+
      '</div>'+
    '</div>'+
    '<div class="filters" style="margin-bottom:14px">'+
      '<div class="field" style="min-width:150px;margin-bottom:0"><label>Desde</label><input type="date" id="layaway-date-from" value="'+(params.dateFrom||'')+'"></div>'+
      '<div class="field" style="min-width:150px;margin-bottom:0"><label>Hasta</label><input type="date" id="layaway-date-to" value="'+(params.dateTo||'')+'"></div>'+
      '<button class="btn secondary small" id="layaway-date-filter-apply" type="button">Ver</button>'+
      (params.hasDateFilter ? '<button class="btn secondary small" id="layaway-date-filter-clear" type="button">Quitar filtro</button>' : '')+
    '</div>'+
    (params.hasDateFilter ? '<p class="hint" style="margin-top:-8px">Mostrando apartados '+escapeHtml(params.dateLabel)+'. Para ver todos otra vez, quita el filtro.</p>' : '');
}

/* Compone la pantalla completa de la pestaña Apartados: el formulario de
   "Nuevo apartado" + encabezado/filtros + la tabla plana o el acordeón
   año/mes (params.groupsHtml, ya armado por el Controlador) + el botón de
   exportar CSV en su propia tarjeta, mismo patrón visual que Envíos. */
function renderApartadosViewHtml(params){
  return layawayFormHtml(params.saving) +
    layawayListHeaderHtml(params) +
    params.groupsHtml +
    '<div class="card">'+
      '<button class="btn secondary small" id="export-apartados-csv" type="button">Exportar CSV</button>'+
    '</div>';
}

function layawayPaymentItemHtml(p){
  return '<div class="item" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--grid)">'+
    '<span style="flex:1">$'+p.amount.toFixed(2)+(p.date?' — '+escapeHtml(fmtDateShort(p.date)):'')+(p.note?' — '+escapeHtml(p.note):'')+'</span>'+
    '<button class="btn danger small" data-del-payment="'+escapeHtml(p.id)+'" type="button">Quitar</button>'+
  '</div>';
}

/* Markup de la ventana "Ver / abonar". No abre el modal ni conecta
   eventos — eso lo hace el Controlador con openModal(...). */
function layawayModalHtml(l, saving){
  var abonado = layawayAbonado(l);
  var restanteRaw = layawayRestante(l);
  var isLiquidado = layawayIsLiquidado(l);
  var restante = Math.max(0, restanteRaw);
  // Si ya se cubrió el total pero el estatus todavía no dice "Completado",
  // se preselecciona esa opción como sugerencia — no se guarda nada solo
  // por abrir el modal, es nada más para que sea un clic guardar y quede
  // marcado como liquidado.
  var suggestedStatus = (isLiquidado && l.status !== 'completado') ? 'completado' : l.status;
  var statusOpts = ['apartado','pendiente','completado'].map(function(st){
    return '<option value="'+st+'"'+(st===suggestedStatus?' selected':'')+'>'+layawayStatusLabel(st)+'</option>';
  }).join('');
  var paymentsHtml = l.payments.length ? l.payments.map(layawayPaymentItemHtml).join('') : '<div class="empty">Sin abonos registrados.</div>';

  return '<h3>'+escapeHtml(l.customerName)+' — '+escapeHtml(l.product)+'</h3>'+
    '<p class="hint" style="margin-top:-6px">Total $'+l.totalAmount.toFixed(2)+' · Abonado $'+abonado.toFixed(2)+' · Restante <strong>$'+restante.toFixed(2)+'</strong></p>'+
    (isLiquidado ? '<p style="margin:6px 0 0;color:var(--good);font-weight:700">✅ Liquidado — el total de los abonos ya cubre el monto completo.</p>' : '')+
    '<h4 style="margin:16px 0 6px">Abonos ('+l.payments.length+')</h4>'+
    '<div id="layaway-payments-list">'+paymentsHtml+'</div>'+
    '<div class="grid3" style="margin-top:10px">'+
      '<div class="field"><label>Nuevo abono</label><input type="number" min="0.01" step="0.01" id="lp-amount"></div>'+
      '<div class="field"><label>Fecha</label><input type="date" id="lp-date" value="'+todayISO()+'"></div>'+
      '<div class="field"><label>Nota</label><input type="text" id="lp-note"></div>'+
    '</div>'+
    '<button class="btn secondary small" id="lp-add" type="button" '+(saving?'disabled':'')+'>Agregar abono</button>'+
    '<h4 style="margin:20px 0 6px">Datos del apartado</h4>'+
    '<div class="grid2">'+
      '<div class="field"><label>Cliente</label><input type="text" id="el-customerName" value="'+escapeHtml(l.customerName)+'"></div>'+
      '<div class="field"><label>Teléfono</label><input type="text" id="el-phone" value="'+escapeHtml(l.phone)+'"></div>'+
    '</div>'+
    '<div class="grid3">'+
      '<div class="field"><label>Producto</label><input type="text" id="el-product" value="'+escapeHtml(l.product)+'"></div>'+
      '<div class="field"><label>Monto total</label><input type="number" min="0" step="0.01" id="el-total" value="'+l.totalAmount+'"></div>'+
      '<div class="field"><label>Estatus</label><select id="el-status">'+statusOpts+'</select></div>'+
    '</div>'+
    '<div class="grid3">'+
      '<div class="field"><label>Forma de apartado</label><input type="text" id="el-depositMethod" value="'+escapeHtml(l.depositMethod)+'"></div>'+
      '<div class="field"><label>Forma de pago liquidado</label><input type="text" id="el-settlePaymentMethod" value="'+escapeHtml(l.settlePaymentMethod)+'"></div>'+
      '<div class="field"><label>Fecha de liquidación</label><input type="date" id="el-settleDate" value="'+escapeHtml(l.settleDate)+'"></div>'+
    '</div>'+
    '<div class="field"><label>Notas</label><input type="text" id="el-notes" value="'+escapeHtml(l.notes)+'"></div>'+
    '<div class="err" id="edit-layaway-err"></div>'+
    '<div class="row" style="margin-top:14px"><button class="btn" id="edit-layaway-save" type="button">Guardar cambios</button>'+
    '<button class="btn secondary" id="edit-layaway-cancel" type="button">Cerrar</button></div>';
}
