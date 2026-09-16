/* GolDentist · Ventas
   Frontend estatico conectado a Supabase (Postgres + Auth) via supabase-js.
   El HTML/CSS (cabecera, shell, logo) vive en index.html; este archivo solo
   trae la logica: cargar datos, registrar/editar/eliminar, y el panel admin.
   Configura SUPABASE_URL y SUPABASE_ANON_KEY en config.js antes de subir. */

(function(){

var CAT_VARS = ['--s1','--s2','--s3','--s4','--s5','--s6','--s7','--s8'];
var MONTHS_ES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
var MONTHS_ES_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

var STATE = null;
var ADMIN = false;
var CURRENT_USER_EMAIL = '';
var supabaseClient = null;
var CURRENT_TAB = 'registrar';
var PANEL_FILTERS = { range: 'todo', channel: 'todos', article: 'todos', msgPlatform: 'todos', dateFrom: null, dateTo: null };
var SAVING = false;
var MY_LIST_FILTER = null; // set on boot: 'mias' or 'todas'
var PANEL_VIEW = 'ventas'; // 'ventas' or 'mensajes'
var SHIP_FILTER = 'pendientes'; // 'pendientes', 'enviados' o 'todos'
var SHIP_DATE_FROM = null; // 'AAAA-MM-DD' o null — límite inferior del filtro de fecha (inclusivo)
var SHIP_DATE_TO = null; // 'AAAA-MM-DD' o null — límite superior del filtro de fecha (inclusivo)
var SHIP_EXPANDED = null; // se inicializa en el primer render con el mes más reciente abierto
var SHIP_YEAR_EXPANDED = null; // 'AAAA' -> bool, año más reciente abierto por default (SHIP_EXPANDED cubre el nivel de mes)
var SALES_YEAR_EXPANDED = null; // 'AAAA' -> bool, año más reciente abierto por default
var SALES_MONTH_EXPANDED = null; // 'AAAA-MM' -> bool, mes más reciente abierto por default
var MSG_YEAR_EXPANDED = null; // 'AAAA' -> bool, año más reciente abierto por default
var MSG_MONTH_EXPANDED = null; // 'AAAA-MM' -> bool, mes más reciente abierto por default
var MSG_STAGES = [
  { key: 'noResp', label: 'No respondidos', color: '--s1' },
  { key: 'valoracion', label: 'Valoración iniciada', color: '--s2' },
  { key: 'propuesta', label: 'Propuesta', color: '--s3' },
  { key: 'pagoPendiente', label: 'Pago pendiente', color: '--s4' },
  { key: 'contactarOtra', label: 'Contactar otra fecha', color: '--s5' },
  { key: 'fueraCatalogo', label: 'Fuera del catálogo', color: '--s6' },
  { key: 'descartados', label: 'Leads descartados', color: '--s7' },
  { key: 'ventaCerrada', label: 'Venta cerrada', color: '--s8' }
];

function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

function escapeHtml(s){
  s = (s===undefined || s===null) ? '' : String(s);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function normName(s){ return (s||'').trim().toLowerCase(); }

function getMyName(){
  try{ return localStorage.getItem('gd_my_name') || ''; }catch(e){ return ''; }
}
function setMyName(name){
  try{ if(name) localStorage.setItem('gd_my_name', name); }catch(e){}
}

function canEditSale(sale){
  if(ADMIN) return true;
  if(!sale.seller) return true; // registros sin vendedora asignada (p.ej. importados del histórico) — cualquiera puede corregirlos
  var mine = getMyName();
  if(!mine) return false;
  return normName(sale.seller) === normName(mine);
}

function todayISO(){
  var d = new Date();
  var m = String(d.getMonth()+1).padStart(2,'0');
  var day = String(d.getDate()).padStart(2,'0');
  return d.getFullYear()+'-'+m+'-'+day;
}

function fmtDateShort(iso){
  if(!iso) return '';
  var p = iso.split('-');
  if(p.length!==3) return iso;
  return p[2]+'/'+p[1]+'/'+p[0];
}

function fmtDateLabel(iso){
  var p = iso.split('-');
  if(p.length!==3) return iso;
  return p[2]+' '+MONTHS_ES[parseInt(p[1],10)-1];
}

var SELLER_OTHER = 'Otro';

/* Paquetería con la que se generó la guía de un envío. Lista fija más
   "Otro" con captura manual (mismo patrón que "Otro" en Vendedora) — no
   necesita catálogo en la base de datos porque no se pidió normalizar
   este campo, a diferencia de Estado. */
var CARRIER_OPTIONS = ['DHL', 'FedEx', 'Estafeta'];
var CARRIER_OTHER = 'Otro';
function isKnownSeller(name){
  return !!name && STATE.sellers.indexOf(name) !== -1;
}
function sellerOptionsHtml(selected){
  var list = STATE.sellers.concat([SELLER_OTHER]);
  return list.map(function(name){
    return '<option value="'+escapeHtml(name)+'"'+(name===selected?' selected':'')+'>'+escapeHtml(name)+'</option>';
  }).join('');
}

function channelColorVar(channel){
  var idx = STATE.channels.indexOf(channel);
  if(idx < 0 || idx >= CAT_VARS.length) return '--text-muted';
  return CAT_VARS[idx];
}

function platformColorVar(platform){
  var idx = STATE.msgPlatforms.indexOf(platform);
  if(idx < 0 || idx >= CAT_VARS.length) return '--text-muted';
  return CAT_VARS[idx];
}

/* ---------- envíos / apartados: helpers de estatus ---------- */
var SHIP_STATUS_COLOR = { pendiente: '#c9820a', enviado: '#2a9d5c' };
function shipmentStatusLabel(status){ return status === 'enviado' ? 'Enviado' : 'Pendiente'; }
function shipmentStatusColor(status){ return SHIP_STATUS_COLOR[status] || '#8a8a8a'; }

function statusPillHtml(label, color){
  return '<span class="pill"><span class="swatch" style="background:'+color+'"></span>'+escapeHtml(label)+'</span>';
}

/* Agrupa una lista (con campo .date en formato ISO) por año-mes, más
   reciente primero. Al usar la llave "AAAA-MM" (no solo el mes), el
   agrupado ya separa automáticamente por año sin necesitar ningún cambio
   cuando termina el año: enero de 2027 simplemente es una llave nueva,
   más arriba en el orden, que enero de 2026. */
function groupByYearMonth(list){
  var map = {};
  list.forEach(function(item){
    var p = (item.date || '').split('-');
    if(p.length !== 3) return;
    var key = p[0] + '-' + p[1];
    if(!map[key]) map[key] = { key: key, year: p[0], month: parseInt(p[1],10), items: [] };
    map[key].items.push(item);
  });
  return Object.keys(map).sort().reverse().map(function(k){ return map[k]; });
}
function yearMonthLabel(group){
  return MONTHS_ES_FULL[group.month-1] + ' ' + group.year;
}

/* Agrupa una lista (con campo .date ISO) un nivel más que groupByYearMonth:
   por año. Año más reciente primero; dentro de cada año, los meses ya
   vienen ordenados (más reciente primero) porque parten de
   groupByYearMonth(). La usan Registrar venta, Mensajes y Envíos para que
   ninguna de esas listas se vuelva un listado interminable según pasan
   los meses y los años. */
function groupByYear(list){
  var monthGroups = groupByYearMonth(list);
  var map = {}, order = [];
  monthGroups.forEach(function(mg){
    if(!map[mg.year]){ map[mg.year] = { year: mg.year, months: [], items: [] }; order.push(mg.year); }
    map[mg.year].months.push(mg);
    map[mg.year].items = map[mg.year].items.concat(mg.items);
  });
  return order.sort().reverse().map(function(y){ return map[y]; });
}

/* Arma un acordeón de dos niveles (Año > Mes) para cualquier lista con
   fecha. `yearExpanded`/`monthExpanded` son mapas { 'AAAA': bool } /
   { 'AAAA-MM': bool } que la pantalla ya trae inicializados (año/mes más
   reciente abiertos por default) — este helper solo los lee, no los
   inicializa. `yearAttr`/`monthAttr` son el nombre del atributo
   data-* (sin el prefijo "data-") que llevan los botones de cada nivel —
   distinto por sección, para no chocar con los de otra pestaña que siga
   viva en el DOM (mismo criterio que ya usa el resto de la app con
   data-edit/data-edit-msg/data-edit-ship, etc.). `renderBody(items)` arma
   el HTML (normalmente una tabla) de un mes ya con sus registros. */
function yearMonthAccordionHtml(items, yearExpanded, monthExpanded, yearAttr, monthAttr, renderBody, itemLabel, emptyMsg){
  var yearGroups = groupByYear(items);
  if(!yearGroups.length) return '<div class="card"><div class="empty">'+emptyMsg+'</div></div>';
  function countLabel(n){ return n + ' ' + itemLabel + (n===1?'':'s'); }
  return yearGroups.map(function(yg){
    var yOpen = !!yearExpanded[yg.year];
    return '<div class="card" style="padding-bottom:'+(yOpen?'20px':'8px')+'">'+
      '<button class="row" data-'+yearAttr+'="'+yg.year+'" type="button" style="width:100%;justify-content:space-between;align-items:center;background:none;border:none;padding:0;cursor:pointer;font:inherit;color:inherit">'+
        '<h2 style="margin:0">'+escapeHtml(yg.year)+'</h2>'+
        '<span class="hint" style="margin:0">'+countLabel(yg.items.length)+' '+(yOpen?'▲':'▼')+'</span>'+
      '</button>'+
      (yOpen ? (
        '<div style="margin-top:14px;display:flex;flex-direction:column;gap:12px">'+
        yg.months.map(function(mg){
          var mOpen = !!monthExpanded[mg.key];
          return '<div style="border:1px solid var(--grid);border-radius:10px;padding:'+(mOpen?'14px':'10px 14px')+'">'+
            '<button class="row" data-'+monthAttr+'="'+mg.key+'" type="button" style="width:100%;justify-content:space-between;align-items:center;background:none;border:none;padding:0;cursor:pointer;font:inherit;color:inherit">'+
              '<h3 style="margin:0;font-size:15px">'+escapeHtml(MONTHS_ES_FULL[mg.month-1])+'</h3>'+
              '<span class="hint" style="margin:0">'+countLabel(mg.items.length)+' '+(mOpen?'▲':'▼')+'</span>'+
            '</button>'+
            (mOpen ? ('<div style="margin-top:12px">'+renderBody(mg.items)+'</div>') : '')+
          '</div>';
        }).join('')+
        '</div>'
      ) : '')+
    '</div>';
  }).join('');
}

function toast(msg){
  var t = $('#toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(function(){ t.classList.remove('show'); }, 2600);
}

/* ---------- exportar CSV ----------
   Se quitó de la versión anterior (artifact de claude.ai) porque esa
   plataforma bloqueaba compartir el enlace públicamente si el artifact
   tenía la capacidad de descarga de archivos activada. Esta versión ya no
   corre dentro de ese visor — es una página normal en el dominio propio —
   así que la descarga funciona sin restricciones. Se usa punto y coma
   como separador porque es lo que espera Excel en configuración regional
   en español al abrir un CSV con doble clic. */
function csvEscape(v){
  var s = (v===undefined || v===null) ? '' : String(v);
  if(/[";\n]/.test(s)) s = '"' + s.replace(/"/g,'""') + '"';
  return s;
}

function downloadCsv(filename, headers, rows){
  var lines = [headers.map(csvEscape).join(';')];
  rows.forEach(function(row){ lines.push(row.map(csvEscape).join(';')); });
  var csv = '\uFEFF' + lines.join('\r\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
}

function sortedByDate(list){
  return list.slice().sort(function(a,b){ return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });
}

function exportSalesCsv(list, filename){
  var headers = ['Fecha','Canal','Artículo','Cantidad','Vendedora'];
  var rows = sortedByDate(list).map(function(s){
    return [s.date, s.channel, s.article, s.qty, s.seller];
  });
  downloadCsv(filename, headers, rows);
}

function exportMessagesCsv(list, filename){
  var headers = ['Fecha','Plataforma','Atendidos','No respondidos','Valoración iniciada','Propuesta','Pago pendiente','Contactar otra fecha','Leads descartados','Venta cerrada','Fuera del catálogo'];
  var rows = sortedByDate(list).map(function(m){
    return [m.date, m.platform, m.atendidos, m.noResp, m.valoracion, m.propuesta, m.pagoPendiente, m.contactarOtra, m.descartados, m.ventaCerrada, m.fueraCatalogo];
  });
  downloadCsv(filename, headers, rows);
}

function exportShipmentsCsv(list, filename){
  var headers = ['No. envío','Fecha','ID venta','Cliente','Teléfono','Email','Calle y número','Colonia','Ciudad','Estado','CP','País','Producto','Cantidad','Estatus','Paquetería','No. de guía','Notas'];
  var rows = sortedByDate(list).map(function(s){
    return [s.noEnvio, s.date, s.ventaId, s.customerName, s.phone, s.email, s.street, s.neighborhood, s.city, s.state, s.zip, s.country, s.product, s.qty, s.status === 'enviado' ? 'Enviado' : 'Pendiente', s.paqueteria, s.noGuia, s.notes];
  });
  downloadCsv(filename, headers, rows);
}


/* ---------- modal ---------- */
/* opts.maxWidth (opcional): para modales que necesitan más espacio que el
   ancho normal (por ejemplo, el de "Ver datos de envío"), sin agrandar
   todos los demás modales de la app. */
function openModal(innerHtml, onMount, opts){
  opts = opts || {};
  var root = $('#modal-root');
  var styleAttr = opts.maxWidth ? ' style="max-width:'+opts.maxWidth+'"' : '';
  root.innerHTML = '<div class="modal-backdrop" id="modal-backdrop"><div class="modal"'+styleAttr+'>'+innerHtml+'</div></div>';
  $('#modal-backdrop').addEventListener('click', function(e){ if(e.target.id==='modal-backdrop') closeModal(); });
  if(onMount) onMount(root);
}
function closeModal(){ $('#modal-root').innerHTML = ''; }

/* window.confirm()/alert() are blocked (silently no-op) inside the sandboxed iframe
   the published artifact runs in, so use our own modal for any yes/no confirmation. */
function confirmModal(message, onConfirm){
  openModal(
    '<h3>Confirmar</h3>'+
    '<p style="margin:0 0 18px;color:var(--text-secondary)">'+escapeHtml(message)+'</p>'+
    '<div class="row"><button class="btn danger" id="confirm-yes" type="button">Sí, eliminar</button>'+
    '<button class="btn secondary" id="confirm-no" type="button">Cancelar</button></div>',
    function(){
      $('#confirm-no').addEventListener('click', closeModal);
      $('#confirm-yes').addEventListener('click', function(){
        closeModal();
        onConfirm();
      });
    }
  );
}

/* ---------- persistence (Supabase) ---------- */
function initSupabase(){
  if(!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){
    return null;
  }
  return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}

function rowToSale(r){
  return { id: r.id, date: r.date, channel: r.channel, article: r.article, qty: r.qty, seller: r.seller || '' };
}
function rowToMessage(r){
  return {
    id: r.id, date: r.date, platform: r.platform,
    atendidos: r.atendidos, noResp: r.no_resp, valoracion: r.valoracion,
    propuesta: r.propuesta, pagoPendiente: r.pago_pendiente, contactarOtra: r.contactar_otra,
    descartados: r.descartados, ventaCerrada: r.venta_cerrada, fueraCatalogo: r.fuera_catalogo
  };
}
function msgFieldsToRow(fields){
  return {
    atendidos: fields.atendidos, no_resp: fields.noResp, valoracion: fields.valoracion,
    propuesta: fields.propuesta, pago_pendiente: fields.pagoPendiente, contactar_otra: fields.contactarOtra,
    descartados: fields.descartados, venta_cerrada: fields.ventaCerrada, fuera_catalogo: fields.fueraCatalogo
  };
}
function rowToShipment(r){
  return {
    id: r.id, noEnvio: r.no_envio || '', ventaId: r.venta_id || '',
    customerName: r.customer_name || '', phone: r.phone || '', email: r.email || '',
    street: r.street || '', neighborhood: r.neighborhood || '', city: r.city || '',
    state: r.state || '', zip: r.zip || '', country: r.country || 'MEXICO',
    product: r.product || '', qty: r.qty, date: r.date,
    notes: r.notes || '', status: r.status || 'pendiente',
    paqueteria: r.paqueteria || '', noGuia: r.no_guia || ''
  };
}

function loadState(){
  return Promise.all([
    supabaseClient.from('channels').select('name').order('id'),
    supabaseClient.from('sellers').select('name').order('id'),
    supabaseClient.from('articles').select('name').order('id'),
    supabaseClient.from('message_platforms').select('name').order('id'),
    supabaseClient.from('sales').select('*').order('id'),
    supabaseClient.from('messages').select('*').order('id'),
    supabaseClient.from('shipments').select('*').order('id'),
    supabaseClient.from('layaways').select('*').order('id'),
    supabaseClient.from('layaway_payments').select('*').order('id'),
    supabaseClient.from('mx_states').select('name').order('name')
  ]).then(function(results){
    for(var i=0;i<results.length;i++){ if(results[i].error) throw results[i].error; }
    var layaways = results[7].data.map(rowToLayaway);
    var layawaysById = {};
    layaways.forEach(function(l){ layawaysById[l.id] = l; });
    results[8].data.map(rowToPayment).forEach(function(p){
      var l = layawaysById[p.layawayId];
      if(l) l.payments.push(p);
    });
    STATE = {
      channels: results[0].data.map(function(r){ return r.name; }),
      sellers: results[1].data.map(function(r){ return r.name; }),
      articles: results[2].data.map(function(r){ return r.name; }),
      msgPlatforms: results[3].data.map(function(r){ return r.name; }),
      sales: results[4].data.map(rowToSale),
      messages: results[5].data.map(rowToMessage),
      shipments: results[6].data.map(rowToShipment),
      layaways: layaways,
      mxStates: results[9].data.map(function(r){ return r.name; })
    };
  });
}

function friendlyError(err, fallback){
  if(err && err.code === '23505') return 'Ese valor ya existe.';
  if(err && err.message) return err.message;
  return fallback || 'No se pudo guardar. Intenta de nuevo.';
}

/* runMutation: ejecuta una operación contra Supabase, recarga STATE y vuelve a
   pintar la pantalla. opts.onSuccess(): callback opcional (p.ej. mostrar un
   toast). opts.errorMsg: mensaje fijo a mostrar si falla (si no, se usa
   friendlyError). */
function runMutation(fn, opts){
  opts = opts || {};
  if(SAVING) return;
  SAVING = true;
  render();
  fn().then(function(){
    return loadState();
  }).then(function(){
    SAVING = false;
    render();
    if(opts.onSuccess) opts.onSuccess();
  }).catch(function(err){
    SAVING = false;
    render();
    console.error(err);
    toast(opts.errorMsg || friendlyError(err));
  });
}

function pgCall(promise){
  return promise.then(function(res){
    if(res.error) throw res.error;
    return res.data;
  });
}

function addRow(table, payload, opts){
  runMutation(function(){
    return pgCall(supabaseClient.from(table).insert(payload));
  }, opts);
}
function updateRow(table, id, payload, opts){
  runMutation(function(){
    return pgCall(supabaseClient.from(table).update(payload).eq('id', id).select()).then(function(rows){
      if(!rows || !rows.length) throw new Error('No se pudo guardar el cambio. Verifica tu sesión o que el registro siga existiendo.');
    });
  }, opts);
}
function deleteRow(table, id, opts){
  runMutation(function(){
    return pgCall(supabaseClient.from(table).delete().eq('id', id).select()).then(function(rows){
      if(!rows || !rows.length) throw new Error('No se pudo eliminar. Verifica tu sesión o que el registro siga existiendo.');
    });
  }, opts);
}
function addCatalogName(table, name, opts){
  addRow(table, { name: name }, opts);
}
function removeCatalogByName(table, name, opts){
  runMutation(function(){
    return pgCall(supabaseClient.from(table).delete().eq('name', name).select()).then(function(rows){
      if(!rows || !rows.length) throw new Error('No se pudo quitar "'+name+'". Verifica que iniciaste sesión como admin.');
    });
  }, opts);
}

/* ---------- data helpers ---------- */
function filteredSales(){
  var list = STATE.sales.slice();
  var f = PANEL_FILTERS;
  if(f.range === 'custom'){
    list = list.filter(function(s){ return (!f.dateFrom || s.date >= f.dateFrom) && (!f.dateTo || s.date <= f.dateTo); });
  } else if(f.range !== 'todo'){
    var now = new Date();
    var cutoff = new Date();
    if(f.range === '7d') cutoff.setDate(now.getDate()-7);
    else if(f.range === '30d') cutoff.setDate(now.getDate()-30);
    else if(f.range === 'mes'){ cutoff = new Date(now.getFullYear(), now.getMonth(), 1); }
    list = list.filter(function(s){ return new Date(s.date+'T00:00:00') >= cutoff; });
  }
  if(f.channel !== 'todos') list = list.filter(function(s){ return s.channel === f.channel; });
  if(f.article !== 'todos') list = list.filter(function(s){ return s.article === f.article; });
  return list;
}

function sumBy(list, keyFn){
  var map = {};
  list.forEach(function(s){
    var k = keyFn(s);
    map[k] = (map[k]||0) + (Number(s.qty)||0);
  });
  return map;
}

function sortDesc(map){
  return Object.keys(map).map(function(k){ return {key:k, value: map[k]}; })
    .sort(function(a,b){ return b.value - a.value; });
}

function filteredMessages(){
  var list = STATE.messages.slice();
  var f = PANEL_FILTERS;
  if(f.range === 'custom'){
    list = list.filter(function(m){ return (!f.dateFrom || m.date >= f.dateFrom) && (!f.dateTo || m.date <= f.dateTo); });
  } else if(f.range !== 'todo'){
    var now = new Date();
    var cutoff = new Date();
    if(f.range === '7d') cutoff.setDate(now.getDate()-7);
    else if(f.range === '30d') cutoff.setDate(now.getDate()-30);
    else if(f.range === 'mes'){ cutoff = new Date(now.getFullYear(), now.getMonth(), 1); }
    list = list.filter(function(m){ return new Date(m.date+'T00:00:00') >= cutoff; });
  }
  if(f.msgPlatform && f.msgPlatform !== 'todos') list = list.filter(function(m){ return m.platform === f.msgPlatform; });
  return list;
}

function sumField(list, field){
  return list.reduce(function(a,m){ return a + (Number(m[field])||0); }, 0);
}

function sumFieldBy(list, keyFn, field){
  var map = {};
  list.forEach(function(m){
    var k = keyFn(m);
    map[k] = (map[k]||0) + (Number(m[field])||0);
  });
  return map;
}

/* ---------- render: shell ---------- */
function render(){
  if(!ADMIN && (CURRENT_TAB === 'panel' || CURRENT_TAB === 'catalogo')) CURRENT_TAB = 'registrar';
  renderTabs();
  if(CURRENT_TAB === 'registrar') renderRegistrar();
  else if(CURRENT_TAB === 'mensajes') renderMensajes();
  else if(CURRENT_TAB === 'envios') renderEnvios();
  else if(CURRENT_TAB === 'apartados') renderApartados();
  else if(CURRENT_TAB === 'panel') renderPanel();
  else if(CURRENT_TAB === 'catalogo') renderCatalogo();
  $all('.view').forEach(function(v){ v.classList.remove('active'); });
  var active = $('#view-'+CURRENT_TAB);
  if(active) active.classList.add('active');
  var sessionEmailEl = $('#session-email');
  if(sessionEmailEl) sessionEmailEl.textContent = CURRENT_USER_EMAIL + (ADMIN ? ' · Admin' : '');
  var panelTabBtn = $('#tab-panel-btn');
  if(panelTabBtn) panelTabBtn.hidden = !ADMIN;
  var catTabBtn = $('#tab-catalogo-btn');
  if(catTabBtn) catTabBtn.hidden = !ADMIN;
}

function renderTabs(){
  $all('#tabs button').forEach(function(b){
    b.classList.toggle('active', b.dataset.tab === CURRENT_TAB);
  });
}

/* ---------- render: registrar ---------- */
function salesRowHtml(s){
  var editable = canEditSale(s);
  var actions = editable
    ? '<button class="btn secondary small" data-edit="'+escapeHtml(s.id)+'" type="button">Editar</button> '+
      '<button class="btn danger small" data-del="'+escapeHtml(s.id)+'" type="button">Eliminar</button>'
    : '';
  return '<tr>'+
    '<td>'+escapeHtml(fmtDateShort(s.date))+'</td>'+
    '<td><span class="pill"><span class="swatch" style="background:var('+channelColorVar(s.channel)+')"></span>'+escapeHtml(s.channel||'—')+'</span></td>'+
    '<td>'+escapeHtml(s.article)+'</td>'+
    '<td>'+escapeHtml(s.qty)+'</td>'+
    '<td style="white-space:nowrap">'+actions+'</td>'+
    '</tr>';
}
function salesTableHtml(items){
  return '<div style="overflow-x:auto"><table><thead><tr><th>Fecha</th><th>Canal</th><th>Artículo</th><th>Cant.</th><th></th></tr></thead>'+
    '<tbody>'+items.map(salesRowHtml).join('')+'</tbody></table></div>';
}

function renderRegistrar(){
  var view = $('#view-registrar');
  var myName = getMyName();
  if(MY_LIST_FILTER === null) MY_LIST_FILTER = myName ? 'mias' : 'todas';
  var channelOpts = STATE.channels.map(function(c){ return '<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>'; }).join('');
  var articleOpts = STATE.articles.slice().sort().map(function(a){ return '<option value="'+escapeHtml(a)+'"></option>'; }).join('');
  var myKnownSeller = isKnownSeller(myName) ? myName : (myName ? SELLER_OTHER : '');

  var sortedSales = STATE.sales.slice().sort(function(a,b){
    if(a.date === b.date) return (b.id > a.id) ? 1 : -1;
    return a.date < b.date ? 1 : -1;
  });

  var scoped = (MY_LIST_FILTER === 'mias' && myName)
    ? sortedSales.filter(function(s){ return normName(s.seller) === normName(myName); })
    : sortedSales;

  if(SALES_YEAR_EXPANDED === null){
    SALES_YEAR_EXPANDED = {};
    SALES_MONTH_EXPANDED = {};
    var firstSalesYearGroups = groupByYear(sortedSales);
    if(firstSalesYearGroups.length){
      SALES_YEAR_EXPANDED[firstSalesYearGroups[0].year] = true;
      if(firstSalesYearGroups[0].months.length) SALES_MONTH_EXPANDED[firstSalesYearGroups[0].months[0].key] = true;
    }
  }

  var salesGroupsHtml = yearMonthAccordionHtml(
    scoped, SALES_YEAR_EXPANDED, SALES_MONTH_EXPANDED,
    'toggle-sale-year', 'toggle-sale-month', salesTableHtml, 'venta',
    (MY_LIST_FILTER === 'mias' ? 'Aún no has registrado ventas.' : 'Aún no hay ventas registradas.')
  );

  view.innerHTML =
    '<div class="card">'+
      '<h2>Nueva venta</h2>'+
      '<form id="sale-form">'+
        '<div class="grid2">'+
          '<div class="field"><label>Fecha</label><input type="date" id="f-date" required></div>'+
          '<div class="field"><label>Canal</label><select id="f-channel" required><option value="" disabled selected>Selecciona…</option>'+channelOpts+'</select></div>'+
        '</div>'+
        '<div class="field">'+
          '<label>Artículo</label>'+
          '<input list="articles-list" id="f-article" placeholder="Escribe para buscar…" autocomplete="off" required>'+
          '<datalist id="articles-list">'+articleOpts+'</datalist>'+
          '<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:6px;cursor:pointer">'+
            '<input type="checkbox" id="f-article-otro" style="width:auto"> Es un artículo nuevo, aún no está en el catálogo'+
          '</label>'+
        '</div>'+
        '<div class="grid2">'+
          '<div class="field"><label>Cantidad</label><input type="number" id="f-qty" min="1" step="1" value="1" required></div>'+
          '<div class="field"><label>Vendedora</label>'+
            '<select id="f-seller-select" required><option value="" disabled'+(myKnownSeller?'':' selected')+'>Selecciona…</option>'+sellerOptionsHtml(myKnownSeller)+'</select>'+
            '<input type="text" id="f-seller-other" placeholder="Escribe tu nombre" autocomplete="off" style="margin-top:8px;'+(myKnownSeller===SELLER_OTHER?'':'display:none')+'">'+
          '</div>'+
        '</div>'+
        '<p class="hint" style="margin:-4px 0 14px">Se recuerda tu nombre en este dispositivo para que después puedas ver y corregir tus propias ventas.</p>'+
        '<button class="btn" type="submit" '+(SAVING?'disabled':'')+'>Registrar venta</button>'+
      '</form>'+
    '</div>'+
    '<div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'+
      '<h2 style="margin:0">Ventas</h2>'+
      '<div class="row" style="gap:6px">'+
        '<button class="btn '+(MY_LIST_FILTER==='mias'?'':'secondary')+' small" data-filter="mias" type="button">Mías</button>'+
        '<button class="btn '+(MY_LIST_FILTER==='todas'?'':'secondary')+' small" data-filter="todas" type="button">Todas</button>'+
      '</div>'+
    '</div>'+
    salesGroupsHtml+
    '<div class="card">'+
      '<button class="btn secondary small" id="export-sales-tab-csv" type="button">Exportar CSV (todas las ventas)</button>'+
    '</div>';

  $('#f-date').value = todayISO();
  if(myKnownSeller === SELLER_OTHER) $('#f-seller-other').value = myName;

  $('#f-seller-select').addEventListener('change', function(){
    $('#f-seller-other').style.display = (this.value === SELLER_OTHER) ? 'block' : 'none';
  });

  $('#sale-form').addEventListener('submit', function(e){
    e.preventDefault();
    var date = $('#f-date').value;
    var channel = $('#f-channel').value;
    var article = $('#f-article').value.trim();
    var articleIsNew = $('#f-article-otro').checked;
    var qty = parseInt($('#f-qty').value, 10);
    var sellerSel = $('#f-seller-select').value;
    var seller = (sellerSel === SELLER_OTHER ? $('#f-seller-other').value.trim() : sellerSel);
    if(!date || !channel || !article || !qty || qty < 1 || !seller){
      toast('Completa fecha, canal, artículo, cantidad y tu nombre.');
      return;
    }
    if(!articleIsNew && STATE.articles.indexOf(article) === -1){
      toast('Selecciona un artículo del catálogo, o marca "Es un artículo nuevo".');
      return;
    }
    setMyName(seller);
    addRow('sales', { date: date, channel: channel, article: article, qty: qty, seller: seller }, {
      errorMsg: 'No se pudo registrar la venta. Intenta de nuevo.',
      onSuccess: function(){
        // se abre automáticamente el año/mes de la venta recién creada,
        // igual que ya hace Envíos con sus grupos por mes.
        SALES_YEAR_EXPANDED[date.slice(0,4)] = true;
        SALES_MONTH_EXPANDED[date.slice(0,7)] = true;
        toast(articleIsNew ? 'Venta registrada. Pide al admin que agregue "'+article+'" al catálogo cuando pueda.' : 'Venta registrada');
        renderRegistrar();
      }
    });
  });

  $all('[data-filter]').forEach(function(btn){
    btn.addEventListener('click', function(){
      MY_LIST_FILTER = btn.getAttribute('data-filter');
      renderRegistrar();
    });
  });

  $all('[data-toggle-sale-year]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var y = btn.getAttribute('data-toggle-sale-year');
      SALES_YEAR_EXPANDED[y] = !SALES_YEAR_EXPANDED[y];
      renderRegistrar();
    });
  });
  $all('[data-toggle-sale-month]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var k = btn.getAttribute('data-toggle-sale-month');
      SALES_MONTH_EXPANDED[k] = !SALES_MONTH_EXPANDED[k];
      renderRegistrar();
    });
  });

  $('#export-sales-tab-csv').addEventListener('click', function(){
    exportSalesCsv(STATE.sales, 'ventas_goldentist_'+todayISO()+'.csv');
  });

  $all('[data-del]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = Number(btn.getAttribute('data-del'));
      var sale = STATE.sales.filter(function(s){ return s.id === id; })[0];
      if(!sale || !canEditSale(sale)){ toast('No puedes eliminar esta venta.'); return; }
      confirmModal('¿Eliminar este registro de venta?', function(){
        deleteRow('sales', id, { errorMsg: 'No se pudo eliminar. Intenta de nuevo.' });
      });
    });
  });

  $all('[data-edit]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = Number(btn.getAttribute('data-edit'));
      var sale = STATE.sales.filter(function(s){ return s.id === id; })[0];
      if(!sale || !canEditSale(sale)){ toast('No puedes editar esta venta.'); return; }
      openEditSaleModal(sale);
    });
  });
}

function openEditSaleModal(sale){
  var channelOpts = STATE.channels.map(function(c){
    return '<option value="'+escapeHtml(c)+'"'+(c===sale.channel?' selected':'')+'>'+escapeHtml(c)+'</option>';
  }).join('');
  var articleOpts = STATE.articles.slice().sort().map(function(a){ return '<option value="'+escapeHtml(a)+'"></option>'; }).join('');
  var saleKnownSeller = isKnownSeller(sale.seller) ? sale.seller : (sale.seller ? SELLER_OTHER : '');
  var saleArticleKnown = STATE.articles.indexOf(sale.article) !== -1;
  openModal(
    '<h3>Editar venta</h3>'+
    '<div class="grid2">'+
      '<div class="field"><label>Fecha</label><input type="date" id="e-date" value="'+escapeHtml(sale.date)+'" required></div>'+
      '<div class="field"><label>Canal</label><select id="e-channel" required>'+channelOpts+'</select></div>'+
    '</div>'+
    '<div class="field">'+
      '<label>Artículo</label>'+
      '<input list="edit-articles-list" id="e-article" value="'+escapeHtml(sale.article)+'" autocomplete="off" required>'+
      '<datalist id="edit-articles-list">'+articleOpts+'</datalist>'+
      '<label class="hint" style="display:flex;align-items:center;gap:6px;margin-top:6px;cursor:pointer">'+
        '<input type="checkbox" id="e-article-otro" '+(saleArticleKnown?'':'checked')+' style="width:auto"> Es un artículo nuevo, aún no está en el catálogo'+
      '</label>'+
    '</div>'+
    '<div class="grid2">'+
      '<div class="field"><label>Cantidad</label><input type="number" id="e-qty" min="1" step="1" value="'+escapeHtml(sale.qty)+'" required></div>'+
      '<div class="field"><label>Vendedora</label>'+
        '<select id="e-seller-select" required><option value="" disabled'+(saleKnownSeller?'':' selected')+'>Selecciona…</option>'+sellerOptionsHtml(saleKnownSeller)+'</select>'+
        '<input type="text" id="e-seller-other" value="'+(saleKnownSeller===SELLER_OTHER?escapeHtml(sale.seller||''):'')+'" placeholder="Escribe el nombre" autocomplete="off" style="margin-top:8px;'+(saleKnownSeller===SELLER_OTHER?'':'display:none')+'">'+
      '</div>'+
    '</div>'+
    '<div class="err" id="edit-err"></div>'+
    '<div class="row"><button class="btn" id="edit-save" type="button">Guardar cambios</button>'+
    '<button class="btn secondary" id="edit-cancel" type="button">Cancelar</button></div>',
    function(){
      $('#edit-cancel').addEventListener('click', closeModal);
      $('#e-seller-select').addEventListener('change', function(){
        $('#e-seller-other').style.display = (this.value === SELLER_OTHER) ? 'block' : 'none';
      });
      $('#edit-save').addEventListener('click', function(){
        var date = $('#e-date').value;
        var channel = $('#e-channel').value;
        var article = $('#e-article').value.trim();
        var articleIsNew = $('#e-article-otro').checked;
        var qty = parseInt($('#e-qty').value, 10);
        var sellerSel = $('#e-seller-select').value;
        var seller = (sellerSel === SELLER_OTHER ? $('#e-seller-other').value.trim() : sellerSel);
        if(!date || !channel || !article || !qty || qty < 1 || !seller){
          $('#edit-err').textContent = 'Completa todos los campos.';
          return;
        }
        if(!articleIsNew && STATE.articles.indexOf(article) === -1){
          $('#edit-err').textContent = 'Ese artículo no está en el catálogo, o marca "Es un artículo nuevo".';
          return;
        }
        var current = STATE.sales.filter(function(s){ return s.id === sale.id; })[0];
        if(!current || !canEditSale(current)){
          $('#edit-err').textContent = 'Ya no puedes editar esta venta.';
          return;
        }
        closeModal();
        updateRow('sales', sale.id, { date: date, channel: channel, article: article, qty: qty, seller: seller }, {
          errorMsg: 'No se pudo actualizar. Intenta de nuevo.',
          onSuccess: function(){ toast('Venta actualizada'); }
        });
      });
    }
  );
}

/* ---------- render: mensajes (registro) ---------- */
function msgFieldsHtml(prefix, m){
  m = m || {};
  function num(field){ return (m[field]===undefined || m[field]===null) ? 0 : m[field]; }
  return '<div class="grid3">'+
    '<div class="field"><label>Atendidos</label><input type="number" min="0" step="1" id="'+prefix+'-atendidos" value="'+num('atendidos')+'"></div>'+
    '<div class="field"><label>No respondidos</label><input type="number" min="0" step="1" id="'+prefix+'-noResp" value="'+num('noResp')+'"></div>'+
    '<div class="field"><label>Valoración iniciada</label><input type="number" min="0" step="1" id="'+prefix+'-valoracion" value="'+num('valoracion')+'"></div>'+
    '<div class="field"><label>Propuesta</label><input type="number" min="0" step="1" id="'+prefix+'-propuesta" value="'+num('propuesta')+'"></div>'+
    '<div class="field"><label>Pago pendiente</label><input type="number" min="0" step="1" id="'+prefix+'-pagoPendiente" value="'+num('pagoPendiente')+'"></div>'+
    '<div class="field"><label>Contactar otra fecha</label><input type="number" min="0" step="1" id="'+prefix+'-contactarOtra" value="'+num('contactarOtra')+'"></div>'+
    '<div class="field"><label>Leads descartados</label><input type="number" min="0" step="1" id="'+prefix+'-descartados" value="'+num('descartados')+'"></div>'+
    '<div class="field"><label>Venta cerrada</label><input type="number" min="0" step="1" id="'+prefix+'-ventaCerrada" value="'+num('ventaCerrada')+'"></div>'+
    '<div class="field"><label>Fuera del catálogo</label><input type="number" min="0" step="1" id="'+prefix+'-fueraCatalogo" value="'+num('fueraCatalogo')+'"></div>'+
  '</div>'+
  '<p class="hint" id="'+prefix+'-sum-check" style="margin:10px 0 0"></p>';
}

function readMsgFields(prefix){
  function v(field){ var n = parseInt($('#'+prefix+'-'+field).value, 10); return isNaN(n) || n < 0 ? 0 : n; }
  return {
    atendidos: v('atendidos'), noResp: v('noResp'), valoracion: v('valoracion'),
    propuesta: v('propuesta'), pagoPendiente: v('pagoPendiente'), contactarOtra: v('contactarOtra'),
    descartados: v('descartados'), ventaCerrada: v('ventaCerrada'), fueraCatalogo: v('fueraCatalogo')
  };
}

// Cada mensaje "atendido" debe terminar en exactamente una de las 8
// categorías siguientes (MSG_STAGES) — por eso su suma debe cuadrar
// siempre con "Atendidos". Se usa tanto para el aviso en vivo del
// formulario como para la validación al guardar y la columna "Coincide"
// de la tabla.
function sumMsgStages(fields){
  return MSG_STAGES.reduce(function(sum, s){ return sum + (Number(fields[s.key])||0); }, 0);
}

function updateMsgSumCheck(prefix){
  var el = $('#'+prefix+'-sum-check');
  if(!el) return;
  var fields = readMsgFields(prefix);
  var suma = sumMsgStages(fields);
  var atendidos = fields.atendidos;
  if(suma === atendidos){
    el.style.color = 'var(--good)';
    el.style.fontWeight = '700';
    el.textContent = '✅ La suma de las 8 categorías ('+suma+') coincide con Atendidos ('+atendidos+').';
  } else {
    el.style.color = 'var(--danger)';
    el.style.fontWeight = '700';
    var diff = suma - atendidos;
    el.textContent = '⚠️ La suma de las 8 categorías ('+suma+') no coincide con Atendidos ('+atendidos+') — '+
      (diff > 0 ? 'sobran '+diff : 'faltan '+(-diff))+'.';
  }
}

function attachMsgSumCheckListeners(prefix){
  ['atendidos'].concat(MSG_STAGES.map(function(s){ return s.key; })).forEach(function(key){
    var el = $('#'+prefix+'-'+key);
    if(el) el.addEventListener('input', function(){ updateMsgSumCheck(prefix); });
  });
  updateMsgSumCheck(prefix);
}

function msgRowHtml(m){
  var suma = sumMsgStages(m);
  var coincide = suma === m.atendidos;
  return '<tr>'+
    '<td>'+escapeHtml(fmtDateShort(m.date))+'</td>'+
    '<td><span class="pill"><span class="swatch" style="background:var('+platformColorVar(m.platform)+')"></span>'+escapeHtml(m.platform||'—')+'</span></td>'+
    '<td>'+m.atendidos+'</td>'+
    '<td>'+m.noResp+'</td>'+
    '<td>'+m.valoracion+'</td>'+
    '<td>'+m.propuesta+'</td>'+
    '<td>'+m.pagoPendiente+'</td>'+
    '<td>'+m.contactarOtra+'</td>'+
    '<td>'+m.descartados+'</td>'+
    '<td>'+m.ventaCerrada+'</td>'+
    '<td>'+m.fueraCatalogo+'</td>'+
    '<td class="msg-coincide" style="color:var('+(coincide?'--good':'--danger')+')" title="'+
      (coincide ? 'La suma de las 8 categorías coincide con Atendidos.' : 'Suma de las 8 categorías: '+suma+' — no coincide con Atendidos ('+m.atendidos+').')+
    '">'+(coincide ? '✅' : '⚠️')+'</td>'+
    '<td style="white-space:nowrap">'+
      '<button class="btn secondary small" data-edit-msg="'+escapeHtml(m.id)+'" type="button" title="Editar">✎</button> '+
      '<button class="btn danger small" data-del-msg="'+escapeHtml(m.id)+'" type="button" title="Eliminar">🗑</button>'+
    '</td>'+
  '</tr>';
}
function msgTableHtml(items){
  return '<div class="msg-table-wrap">'+
    '<div class="msg-scroll-top"><div class="msg-scroll-top-inner"></div></div>'+
    '<div class="msg-scroll-bottom"><table class="msg-table"><thead><tr>'+
      '<th>Fecha</th><th>Plataforma</th><th>Atendidos</th><th>No resp.</th><th>Valoración</th>'+
      '<th>Propuesta</th><th>Pago pend.</th><th>Contactar</th><th>Descartados</th>'+
      '<th>Venta cerrada</th><th>Fuera catálogo</th><th title="¿La suma de las 8 categorías coincide con Atendidos?">Coincide</th><th></th>'+
      '</tr></thead>'+
      '<tbody>'+items.map(msgRowHtml).join('')+'</tbody></table>'+
    '</div>'+
  '</div>';
}

// Sincroniza la barra de scroll horizontal duplicada arriba de cada tabla
// de Mensajes con la barra real de abajo, en ambas direcciones — puede
// haber varias tablas a la vez (una por cada mes del acordeón que esté
// abierto), por eso se busca cada '.msg-table-wrap' por separado.
function attachMsgTableTopScroll(){
  $all('.msg-table-wrap').forEach(function(wrap){
    var top = wrap.querySelector('.msg-scroll-top');
    var topInner = wrap.querySelector('.msg-scroll-top-inner');
    var bottom = wrap.querySelector('.msg-scroll-bottom');
    var table = wrap.querySelector('table');
    if(!top || !topInner || !bottom || !table) return;

    function syncWidth(){ topInner.style.width = table.scrollWidth + 'px'; }

    // render() todavía no le puso la clase "active" a #view-mensajes en
    // este mismo tick, así que la vista sigue oculta (ancho 0) justo
    // cuando esto corre. Con datos reales de Supabase (a diferencia del
    // mock de las pruebas, que resuelve al instante) el primer render
    // puede además quedar con la tabla vacía y luego volver a dibujarse
    // cuando llegan los datos — un solo requestAnimationFrame no cubre
    // ese segundo cambio. ResizeObserver sí: informa el tamaño real en
    // cuanto la tabla se vuelve visible y se dispara de nuevo cada vez
    // que su ancho cambia (datos nuevos, ventana redimensionada, etc.),
    // así que la barra de arriba se mantiene correcta sin depender de
    // adivinar el momento exacto en que ya se puede medir.
    if(window.ResizeObserver){
      new ResizeObserver(syncWidth).observe(table);
    } else {
      requestAnimationFrame(syncWidth);
    }

    var syncing = false;
    top.addEventListener('scroll', function(){
      if(syncing) return;
      syncing = true;
      bottom.scrollLeft = top.scrollLeft;
      syncing = false;
    });
    bottom.addEventListener('scroll', function(){
      if(syncing) return;
      syncing = true;
      top.scrollLeft = bottom.scrollLeft;
      syncing = false;
    });
  });
}

function renderMensajes(){
  var view = $('#view-mensajes');
  var platformOpts = STATE.msgPlatforms.map(function(p){ return '<option value="'+escapeHtml(p)+'">'+escapeHtml(p)+'</option>'; }).join('');

  var sorted = STATE.messages.slice().sort(function(a,b){
    if(a.date === b.date) return (b.id > a.id) ? 1 : -1;
    return a.date < b.date ? 1 : -1;
  });

  if(MSG_YEAR_EXPANDED === null){
    MSG_YEAR_EXPANDED = {};
    MSG_MONTH_EXPANDED = {};
    var firstMsgYearGroups = groupByYear(sorted);
    if(firstMsgYearGroups.length){
      MSG_YEAR_EXPANDED[firstMsgYearGroups[0].year] = true;
      if(firstMsgYearGroups[0].months.length) MSG_MONTH_EXPANDED[firstMsgYearGroups[0].months[0].key] = true;
    }
  }

  var msgGroupsHtml = yearMonthAccordionHtml(
    sorted, MSG_YEAR_EXPANDED, MSG_MONTH_EXPANDED,
    'toggle-msg-year', 'toggle-msg-month', msgTableHtml, 'registro',
    'Aún no hay registros de mensajes.'
  );

  view.innerHTML =
    '<div class="card">'+
      '<h2>Nuevo registro de mensajes</h2>'+
      '<p class="hint" style="margin-top:-6px">Captura el resumen del día por plataforma (cuántos mensajes se atendieron y en qué terminaron).</p>'+
      '<form id="msg-form">'+
        '<div class="grid2">'+
          '<div class="field"><label>Fecha</label><input type="date" id="m-date" required></div>'+
          '<div class="field"><label>Plataforma</label><select id="m-platform" required><option value="" disabled selected>Selecciona…</option>'+platformOpts+'</select></div>'+
        '</div>'+
        msgFieldsHtml('m')+
        '<button class="btn" type="submit" style="margin-top:14px" '+(SAVING?'disabled':'')+'>Registrar</button>'+
      '</form>'+
    '</div>'+
    '<h2 style="margin:0 0 14px">Mensajes</h2>'+
    msgGroupsHtml+
    '<div class="card">'+
      '<button class="btn secondary small" id="export-messages-tab-csv" type="button">Exportar CSV (todos los mensajes)</button>'+
    '</div>';

  $('#m-date').value = todayISO();
  attachMsgSumCheckListeners('m');
  attachMsgTableTopScroll();

  $('#msg-form').addEventListener('submit', function(e){
    e.preventDefault();
    var date = $('#m-date').value;
    var platform = $('#m-platform').value;
    if(!date || !platform){
      toast('Selecciona la fecha y la plataforma.');
      return;
    }
    var fields = readMsgFields('m');
    var suma = sumMsgStages(fields);
    if(suma !== fields.atendidos){
      toast('La suma de las 8 categorías ('+suma+') debe ser igual a Atendidos ('+fields.atendidos+').');
      return;
    }
    var payload = msgFieldsToRow(fields);
    payload.date = date;
    payload.platform = platform;
    addRow('messages', payload, {
      errorMsg: 'No se pudo guardar el registro. Intenta de nuevo.',
      onSuccess: function(){
        MSG_YEAR_EXPANDED[date.slice(0,4)] = true;
        MSG_MONTH_EXPANDED[date.slice(0,7)] = true;
        toast('Registro de mensajes guardado');
        renderMensajes();
      }
    });
  });

  $all('[data-toggle-msg-year]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var y = btn.getAttribute('data-toggle-msg-year');
      MSG_YEAR_EXPANDED[y] = !MSG_YEAR_EXPANDED[y];
      renderMensajes();
    });
  });
  $all('[data-toggle-msg-month]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var k = btn.getAttribute('data-toggle-msg-month');
      MSG_MONTH_EXPANDED[k] = !MSG_MONTH_EXPANDED[k];
      renderMensajes();
    });
  });

  $all('[data-del-msg]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = Number(btn.getAttribute('data-del-msg'));
      confirmModal('¿Eliminar este registro de mensajes?', function(){
        deleteRow('messages', id, { errorMsg: 'No se pudo eliminar. Intenta de nuevo.' });
      });
    });
  });

  $('#export-messages-tab-csv').addEventListener('click', function(){
    exportMessagesCsv(STATE.messages, 'mensajes_goldentist_'+todayISO()+'.csv');
  });

  $all('[data-edit-msg]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = Number(btn.getAttribute('data-edit-msg'));
      var rec = STATE.messages.filter(function(m){ return m.id === id; })[0];
      if(!rec){ toast('Ese registro ya no existe.'); return; }
      openEditMessageModal(rec);
    });
  });
}

function openEditMessageModal(rec){
  var platformOpts = STATE.msgPlatforms.map(function(p){
    return '<option value="'+escapeHtml(p)+'"'+(p===rec.platform?' selected':'')+'>'+escapeHtml(p)+'</option>';
  }).join('');
  openModal(
    '<h3>Editar registro de mensajes</h3>'+
    '<div class="grid2">'+
      '<div class="field"><label>Fecha</label><input type="date" id="em-date" value="'+escapeHtml(rec.date)+'" required></div>'+
      '<div class="field"><label>Plataforma</label><select id="em-platform" required>'+platformOpts+'</select></div>'+
    '</div>'+
    msgFieldsHtml('em', rec)+
    '<div class="err" id="edit-msg-err"></div>'+
    '<div class="row" style="margin-top:14px"><button class="btn" id="edit-msg-save" type="button">Guardar cambios</button>'+
    '<button class="btn secondary" id="edit-msg-cancel" type="button">Cancelar</button></div>',
    function(){
      $('#edit-msg-cancel').addEventListener('click', closeModal);
      attachMsgSumCheckListeners('em');
      $('#edit-msg-save').addEventListener('click', function(){
        var date = $('#em-date').value;
        var platform = $('#em-platform').value;
        if(!date || !platform){
          $('#edit-msg-err').textContent = 'Completa la fecha y la plataforma.';
          return;
        }
        var fields = readMsgFields('em');
        var suma = sumMsgStages(fields);
        if(suma !== fields.atendidos){
          $('#edit-msg-err').textContent = 'La suma de las 8 categorías ('+suma+') debe ser igual a Atendidos ('+fields.atendidos+').';
          return;
        }
        var payload = msgFieldsToRow(fields);
        payload.date = date;
        payload.platform = platform;
        closeModal();
        updateRow('messages', rec.id, payload, {
          errorMsg: 'No se pudo actualizar. Intenta de nuevo.',
          onSuccess: function(){ toast('Registro actualizado'); }
        });
      });
    }
  );
}

/* ---------- render: envíos ---------- */
function shipmentFieldsHtml(prefix, s){
  s = s || {};
  function v(f){ return escapeHtml(s[f] || ''); }
  return '<div class="grid2">'+
      '<div class="field"><label>ID venta (WooCommerce)</label><input type="text" id="'+prefix+'-ventaId" value="'+v('ventaId')+'"></div>'+
      '<div class="field"><label>Cantidad</label><input type="number" min="1" step="1" id="'+prefix+'-qty" value="'+(s.qty||1)+'"></div>'+
    '</div>'+
    '<div class="field"><label>Producto</label><input type="text" id="'+prefix+'-product" value="'+v('product')+'" required></div>'+
    '<div class="grid2">'+
      '<div class="field"><label>Cliente</label><input type="text" id="'+prefix+'-customerName" value="'+v('customerName')+'" required></div>'+
      '<div class="field"><label>Teléfono</label><input type="text" id="'+prefix+'-phone" value="'+v('phone')+'"></div>'+
    '</div>'+
    '<div class="field"><label>Email</label><input type="email" id="'+prefix+'-email" value="'+v('email')+'"></div>'+
    '<div class="field"><label>Calle y número</label><input type="text" id="'+prefix+'-street" value="'+v('street')+'"></div>'+
    '<div class="grid3">'+
      '<div class="field"><label>Colonia</label><input type="text" id="'+prefix+'-neighborhood" value="'+v('neighborhood')+'"></div>'+
      '<div class="field"><label>Ciudad / localidad</label><input type="text" id="'+prefix+'-city" value="'+v('city')+'"></div>'+
      '<div class="field"><label>Estado</label><select id="'+prefix+'-state">'+
        '<option value="">-- Selecciona --</option>'+
        STATE.mxStates.map(function(st){
          return '<option value="'+escapeHtml(st)+'"'+(s.state===st?' selected':'')+'>'+escapeHtml(st)+'</option>';
        }).join('')+
      '</select></div>'+
    '</div>'+
    '<div class="grid2">'+
      '<div class="field"><label>CP</label><input type="text" id="'+prefix+'-zip" value="'+v('zip')+'"></div>'+
      '<div class="field"><label>País</label><input type="text" id="'+prefix+'-country" value="'+(s.country?v('country'):'MEXICO')+'"></div>'+
    '</div>'+
    '<div class="field"><label>Notas</label><input type="text" id="'+prefix+'-notes" value="'+v('notes')+'"></div>';
}

function readShipmentFields(prefix){
  function s(f){ return $('#'+prefix+'-'+f).value.trim(); }
  var qty = parseInt($('#'+prefix+'-qty').value, 10);
  return {
    venta_id: s('ventaId'), customer_name: s('customerName'),
    phone: s('phone'), email: s('email'), street: s('street'), neighborhood: s('neighborhood'),
    city: s('city'), state: s('state') || null, zip: s('zip'), country: s('country') || 'MEXICO',
    product: s('product'), qty: (isNaN(qty) || qty < 1) ? 1 : qty, notes: s('notes')
  };
}

function shipmentsTableHtml(items){
  return '<div style="overflow-x:auto"><table><thead><tr><th>No.</th><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Cant.</th><th>Estatus</th><th></th></tr></thead>'+
    '<tbody>'+items.map(shipmentRowHtml).join('')+'</tbody></table></div>';
}

function shipmentRowHtml(s){
  return '<tr>'+
    '<td>'+(s.noEnvio ? '#'+escapeHtml(s.noEnvio) : '<span class="muted">—</span>')+'</td>'+
    '<td>'+escapeHtml(fmtDateShort(s.date))+'</td>'+
    '<td>'+escapeHtml(s.customerName)+'</td>'+
    '<td>'+escapeHtml(s.product)+'</td>'+
    '<td>'+escapeHtml(s.qty)+'</td>'+
    '<td>'+statusPillHtml(shipmentStatusLabel(s.status), shipmentStatusColor(s.status))+'</td>'+
    '<td style="white-space:nowrap">'+
      '<button class="btn small" data-view-ship="'+escapeHtml(s.id)+'" type="button">Ver datos</button> '+
      '<button class="btn secondary small" data-toggle-ship="'+escapeHtml(s.id)+'" type="button">'+(s.status==='enviado'?'Marcar pendiente':'Marcar enviado')+'</button> '+
      '<button class="btn secondary small" data-edit-ship="'+escapeHtml(s.id)+'" type="button">Editar</button> '+
      '<button class="btn danger small" data-del-ship="'+escapeHtml(s.id)+'" type="button">Eliminar</button>'+
    '</td>'+
  '</tr>';
}

/* Copia texto al portapapeles con la API moderna, y si no está disponible
   (navegador viejo, o la página no corre sobre https) cae a la técnica
   vieja de textarea + execCommand. cb(true/false) avisa si sí se copió. */
function copyToClipboard(text, cb){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){ cb(true); }).catch(function(){ cb(false); });
    return;
  }
  try {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    cb(ok);
  } catch (e) {
    cb(false);
  }
}

/* Modal de solo lectura con los datos de un envío, pensado para que
   bodega los lea y copie campo por campo al armar la guía (cada campo
   tiene su propio botón, porque así es como lo van pegando: uno por uno,
   no todo junto) — a diferencia de "Editar", aquí no hay nada que se
   pueda cambiar por accidente. Se abre más ancho que el resto de los
   modales de la app para que no se amontonen los datos.

   Además, hasta abajo, tiene una sección aparte y sí editable con
   "Paquetería" y "Número de guía": estos dos datos no existen todavía
   cuando se registra el envío (los genera la paquetería después), así
   que los llena quien hace la guía, directo aquí en la misma pantalla
   donde ya está copiando los demás datos — no se agregaron al formulario
   de "Nuevo envío" ni al de "Editar" a propósito. */
function openViewShipmentModal(s){
  var rows = [
    ['No. de envío', s.noEnvio ? '#' + s.noEnvio : ''],
    ['Cliente', s.customerName], ['Teléfono', s.phone], ['Email', s.email],
    ['Calle y número', s.street], ['Colonia', s.neighborhood],
    ['Ciudad / localidad', s.city], ['Estado', s.state], ['CP', s.zip],
    ['País', s.country], ['Producto', s.product], ['Cantidad', s.qty],
    ['ID venta (WooCommerce)', s.ventaId], ['Notas', s.notes]
  ];
  var rowsHtml = rows.map(function(r, i){
    var hasVal = r[1] !== '' && r[1] !== null && r[1] !== undefined;
    var val = hasVal ? escapeHtml(r[1]) : '<span class="muted">—</span>';
    return '<div class="row" style="justify-content:space-between;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--grid)">'+
      '<span class="muted" style="min-width:170px">'+escapeHtml(r[0])+'</span>'+
      '<span style="text-align:right;flex:1;word-break:break-word">'+val+'</span>'+
      (hasVal ? '<button class="btn secondary small" data-copy-field-idx="'+i+'" type="button" style="flex:none">Copiar</button>' : '<span style="width:82px;flex:none"></span>')+
    '</div>';
  }).join('');

  var carrierKnown = s.paqueteria && CARRIER_OPTIONS.indexOf(s.paqueteria) !== -1;
  var carrierSelected = carrierKnown ? s.paqueteria : (s.paqueteria ? CARRIER_OTHER : '');
  var carrierOptsHtml = '<option value="">-- Selecciona --</option>'+
    CARRIER_OPTIONS.concat([CARRIER_OTHER]).map(function(name){
      return '<option value="'+escapeHtml(name)+'"'+(name===carrierSelected?' selected':'')+'>'+escapeHtml(name)+'</option>';
    }).join('');

  openModal(
    '<h3>Datos de envío</h3>'+
    '<div style="margin-bottom:4px">'+rowsHtml+'</div>'+
    '<h3 style="margin-top:24px">Datos de la guía</h3>'+
    '<p class="hint" style="margin-top:-8px">Esto lo llena quien genera la guía en la paquetería, no se captura al registrar el envío.</p>'+
    '<div class="grid2">'+
      '<div class="field">'+
        '<label>Paquetería</label>'+
        '<select id="view-ship-carrier">'+carrierOptsHtml+'</select>'+
        '<input type="text" id="view-ship-carrier-other" placeholder="Escribe la paquetería" autocomplete="off" value="'+(carrierSelected===CARRIER_OTHER?escapeHtml(s.paqueteria||''):'')+'" style="margin-top:8px;'+(carrierSelected===CARRIER_OTHER?'':'display:none')+'">'+
      '</div>'+
      '<div class="field"><label>Número de guía</label><input type="text" id="view-ship-guia" value="'+escapeHtml(s.noGuia||'')+'"></div>'+
    '</div>'+
    '<div class="row" style="margin-top:0"><button class="btn" id="view-ship-save-guia" type="button">Guardar datos de guía</button></div>'+
    '<div class="row" style="margin-top:14px"><button class="btn secondary" id="view-ship-close" type="button">Cerrar</button></div>',
    function(){
      $('#view-ship-close').addEventListener('click', closeModal);
      $all('[data-copy-field-idx]').forEach(function(btn){
        var idx = Number(btn.getAttribute('data-copy-field-idx'));
        btn.addEventListener('click', function(){
          copyToClipboard(String(rows[idx][1]), function(ok){
            toast(ok ? (rows[idx][0] + ' copiado') : 'No se pudo copiar. Selecciona el texto manualmente.');
          });
        });
      });
      $('#view-ship-carrier').addEventListener('change', function(){
        $('#view-ship-carrier-other').style.display = (this.value === CARRIER_OTHER) ? 'block' : 'none';
      });
      $('#view-ship-save-guia').addEventListener('click', function(){
        var carrierSel = $('#view-ship-carrier').value;
        var carrier = (carrierSel === CARRIER_OTHER ? $('#view-ship-carrier-other').value.trim() : carrierSel);
        var guia = $('#view-ship-guia').value.trim();
        closeModal();
        updateRow('shipments', s.id, { paqueteria: carrier || null, no_guia: guia || null }, {
          errorMsg: 'No se pudo guardar la guía. Intenta de nuevo.',
          onSuccess: function(){ toast('Datos de guía guardados'); }
        });
      });
    },
    { maxWidth: '860px' }
  );
}

// Etiqueta legible ("del X al Y", "a partir del X", "hasta el Y") para un
// filtro de fecha Desde/Hasta — la usan tanto Envíos como Apartados.
function dateRangeFilterLabel(from, to){
  if(from && to){
    if(from === to) return 'del '+fmtDateShort(from);
    return 'del '+fmtDateShort(from)+' al '+fmtDateShort(to);
  }
  if(from) return 'a partir del '+fmtDateShort(from);
  if(to) return 'hasta el '+fmtDateShort(to);
  return '';
}
function shipDateFilterLabel(){ return dateRangeFilterLabel(SHIP_DATE_FROM, SHIP_DATE_TO); }

function renderEnvios(){
  var view = $('#view-envios');
  var sorted = STATE.shipments.slice().sort(function(a,b){
    if(a.date === b.date) return (b.id > a.id) ? 1 : -1;
    return a.date < b.date ? 1 : -1;
  });
  var statusScoped = (SHIP_FILTER === 'pendientes') ? sorted.filter(function(s){ return s.status !== 'enviado'; })
    : (SHIP_FILTER === 'enviados') ? sorted.filter(function(s){ return s.status === 'enviado'; })
    : sorted;
  // El filtro de fecha admite un solo día (llenando nada más "Desde", o
  // "Desde" y "Hasta" iguales) o un rango (por ejemplo, todo un mes o una
  // semana) — ambos límites son inclusivos y cualquiera de los dos puede
  // quedar abierto (solo "Desde" = de ahí en adelante; solo "Hasta" = hasta
  // esa fecha). Sin nada capturado, no filtra nada — se siguen viendo
  // todos los envíos, agrupados por mes como siempre.
  var hasDateFilter = !!(SHIP_DATE_FROM || SHIP_DATE_TO);
  var scoped = hasDateFilter ? statusScoped.filter(function(s){
    return (!SHIP_DATE_FROM || s.date >= SHIP_DATE_FROM) && (!SHIP_DATE_TO || s.date <= SHIP_DATE_TO);
  }) : statusScoped;

  var groupsHtml;
  if(hasDateFilter){
    // Con un filtro de fecha activo se muestra una sola tabla plana (sin
    // agrupar por año/mes ni acordeón) en vez de la vista agrupada de
    // siempre — más simple de leer para un rango acotado como una semana o
    // un mes.
    groupsHtml = scoped.length ? ('<div class="card">'+shipmentsTableHtml(scoped)+'</div>')
      : '<div class="card"><div class="empty">No hay envíos en ese rango de fechas.</div></div>';
  } else {
    // Por default se abren solo el año y el mes más recientes; el resto
    // queda cerrado hasta que se le da clic. Esto es lo que hace que la
    // lista aguante crecer por meses y años sin volverse un solo listado
    // interminable: antes solo se agrupaba por mes (con el año pegado en
    // la etiqueta, "Agosto 2026"), pero según se acumulen varios años esa
    // lista plana de meses crece sin límite — agruparla primero por año
    // resuelve eso.
    if(SHIP_YEAR_EXPANDED === null){
      SHIP_YEAR_EXPANDED = {};
      SHIP_EXPANDED = {};
      var firstShipYearGroups = groupByYear(sorted);
      if(firstShipYearGroups.length){
        SHIP_YEAR_EXPANDED[firstShipYearGroups[0].year] = true;
        if(firstShipYearGroups[0].months.length) SHIP_EXPANDED[firstShipYearGroups[0].months[0].key] = true;
      }
    }

    groupsHtml = yearMonthAccordionHtml(
      scoped, SHIP_YEAR_EXPANDED, SHIP_EXPANDED,
      'toggle-ship-year', 'toggle-month', shipmentsTableHtml, 'envío',
      (SHIP_FILTER==='pendientes' ? 'No hay envíos pendientes.' : SHIP_FILTER==='enviados' ? 'No hay envíos marcados como enviados.' : 'Aún no hay envíos registrados.')
    );
  }

  view.innerHTML =
    '<div class="card">'+
      '<h2>Nuevo envío</h2>'+
      '<p class="hint" style="margin-top:-6px">Captura los datos de envío de una venta por WooCommerce para que bodega pueda generar la guía.</p>'+
      '<form id="ship-form">'+
        '<div class="field"><label>Fecha</label><input type="date" id="s-date" required></div>'+
        shipmentFieldsHtml('s')+
        '<button class="btn" type="submit" style="margin-top:14px" '+(SAVING?'disabled':'')+'>Registrar envío</button>'+
      '</form>'+
    '</div>'+
    '<div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'+
      '<h2 style="margin:0">Envíos</h2>'+
      '<div class="row" style="gap:6px;flex-wrap:wrap">'+
        '<button class="btn '+(SHIP_FILTER==='pendientes'?'':'secondary')+' small" data-ship-filter="pendientes" type="button">Pendientes</button>'+
        '<button class="btn '+(SHIP_FILTER==='enviados'?'':'secondary')+' small" data-ship-filter="enviados" type="button">Enviados</button>'+
        '<button class="btn '+(SHIP_FILTER==='todos'?'':'secondary')+' small" data-ship-filter="todos" type="button">Todos</button>'+
      '</div>'+
    '</div>'+
    '<div class="filters" style="margin-bottom:14px">'+
      '<div class="field" style="min-width:150px;margin-bottom:0"><label>Desde</label><input type="date" id="ship-date-from" value="'+(SHIP_DATE_FROM||'')+'"></div>'+
      '<div class="field" style="min-width:150px;margin-bottom:0"><label>Hasta</label><input type="date" id="ship-date-to" value="'+(SHIP_DATE_TO||'')+'"></div>'+
      '<button class="btn secondary small" id="ship-date-filter-apply" type="button">Ver</button>'+
      (hasDateFilter ? '<button class="btn secondary small" id="ship-date-filter-clear" type="button">Quitar filtro</button>' : '')+
    '</div>'+
    (hasDateFilter ? '<p class="hint" style="margin-top:-8px">Mostrando envíos '+escapeHtml(shipDateFilterLabel())+'. Para ver todos otra vez, quita el filtro.</p>' : '')+
    groupsHtml+
    '<div class="card">'+
      '<button class="btn secondary small" id="export-ventas-envios-csv" type="button">Exportar CSV (todos los envíos)</button>'+
      '<p class="hint" style="margin:6px 0 0">Descarga siempre el respaldo completo, sin importar los filtros de arriba.</p>'+
    '</div>';

  $('#s-date').value = todayISO();

  $('#ship-form').addEventListener('submit', function(e){
    e.preventDefault();
    var date = $('#s-date').value;
    var fields = readShipmentFields('s');
    if(!date || !fields.customer_name || !fields.product){
      toast('Completa al menos la fecha, el cliente y el producto.');
      return;
    }
    fields.date = date;
    fields.status = 'pendiente';
    addRow('shipments', fields, {
      errorMsg: 'No se pudo registrar el envío. Intenta de nuevo.',
      onSuccess: function(){
        // el año y el mes del envío recién creado se abren automáticamente
        // para verlo. runMutation ya llamó a render() antes de este
        // callback, así que hay que volver a renderizar para que el grupo
        // recién abierto se vea sin necesitar un clic extra.
        SHIP_YEAR_EXPANDED[date.slice(0,4)] = true;
        SHIP_EXPANDED[date.slice(0,7)] = true;
        toast('Envío registrado');
        renderEnvios();
      }
    });
  });

  $all('[data-ship-filter]').forEach(function(btn){
    btn.addEventListener('click', function(){ SHIP_FILTER = btn.getAttribute('data-ship-filter'); renderEnvios(); });
  });

  $('#ship-date-filter-apply').addEventListener('click', function(){
    var from = $('#ship-date-from').value || null;
    var to = $('#ship-date-to').value || null;
    if(from && to && from > to){
      toast('"Desde" no puede ser una fecha posterior a "Hasta".');
      return;
    }
    SHIP_DATE_FROM = from;
    SHIP_DATE_TO = to;
    renderEnvios();
  });
  if($('#ship-date-filter-clear')){
    $('#ship-date-filter-clear').addEventListener('click', function(){
      SHIP_DATE_FROM = null;
      SHIP_DATE_TO = null;
      renderEnvios();
    });
  }

  $all('[data-toggle-month]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var key = btn.getAttribute('data-toggle-month');
      SHIP_EXPANDED[key] = !SHIP_EXPANDED[key];
      renderEnvios();
    });
  });

  $all('[data-toggle-ship-year]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var y = btn.getAttribute('data-toggle-ship-year');
      SHIP_YEAR_EXPANDED[y] = !SHIP_YEAR_EXPANDED[y];
      renderEnvios();
    });
  });

  $('#export-ventas-envios-csv').addEventListener('click', function(){
    exportShipmentsCsv(STATE.shipments, 'envios_goldentist_'+todayISO()+'.csv');
  });

  $all('[data-toggle-ship]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = Number(btn.getAttribute('data-toggle-ship'));
      var s = STATE.shipments.filter(function(x){ return x.id === id; })[0];
      if(!s) return;
      updateRow('shipments', id, { status: s.status === 'enviado' ? 'pendiente' : 'enviado' }, {
        errorMsg: 'No se pudo actualizar el estatus.',
        onSuccess: function(){ toast(s.status === 'enviado' ? 'Marcado como pendiente' : 'Marcado como enviado'); }
      });
    });
  });

  $all('[data-del-ship]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = Number(btn.getAttribute('data-del-ship'));
      confirmModal('¿Eliminar este envío?', function(){
        deleteRow('shipments', id, { errorMsg: 'No se pudo eliminar. Intenta de nuevo.' });
      });
    });
  });

  $all('[data-edit-ship]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = Number(btn.getAttribute('data-edit-ship'));
      var s = STATE.shipments.filter(function(x){ return x.id === id; })[0];
      if(!s){ toast('Ese envío ya no existe.'); return; }
      openEditShipmentModal(s);
    });
  });

  $all('[data-view-ship]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = Number(btn.getAttribute('data-view-ship'));
      var s = STATE.shipments.filter(function(x){ return x.id === id; })[0];
      if(!s){ toast('Ese envío ya no existe.'); return; }
      openViewShipmentModal(s);
    });
  });
}

function openEditShipmentModal(s){
  openModal(
    '<h3>Editar envío</h3>'+
    '<div class="field"><label>Fecha</label><input type="date" id="es-date" value="'+escapeHtml(s.date)+'" required></div>'+
    shipmentFieldsHtml('es', s)+
    '<div class="err" id="edit-ship-err"></div>'+
    '<div class="row" style="margin-top:14px"><button class="btn" id="edit-ship-save" type="button">Guardar cambios</button>'+
    '<button class="btn secondary" id="edit-ship-cancel" type="button">Cancelar</button></div>',
    function(){
      $('#edit-ship-cancel').addEventListener('click', closeModal);
      $('#edit-ship-save').addEventListener('click', function(){
        var date = $('#es-date').value;
        var fields = readShipmentFields('es');
        if(!date || !fields.customer_name || !fields.product){
          $('#edit-ship-err').textContent = 'Completa al menos la fecha, el cliente y el producto.';
          return;
        }
        fields.date = date;
        closeModal();
        updateRow('shipments', s.id, fields, {
          errorMsg: 'No se pudo actualizar. Intenta de nuevo.',
          onSuccess: function(){ toast('Envío actualizado'); }
        });
      });
    }
  );
}

/* ---------- render: apartados ---------- */
/* ---------- render: panel (dashboard) ---------- */
function renderPanel(){
  var view = $('#view-panel');
  var toggleHtml = '<div class="row" style="gap:6px;margin-bottom:14px">'+
      '<button class="btn '+(PANEL_VIEW==='ventas'?'':'secondary')+' small" data-panel-view="ventas" type="button">Ventas</button>'+
      '<button class="btn '+(PANEL_VIEW==='mensajes'?'':'secondary')+' small" data-panel-view="mensajes" type="button">Mensajes</button>'+
    '</div>';

  view.innerHTML = toggleHtml + (PANEL_VIEW === 'mensajes' ? renderMensajesPanelBody() : renderVentasPanelBody());

  $all('[data-panel-view]').forEach(function(btn){
    btn.addEventListener('click', function(){
      PANEL_VIEW = btn.getAttribute('data-panel-view');
      renderPanel();
    });
  });

  if(PANEL_VIEW === 'mensajes') attachMensajesPanelHandlers();
  else attachVentasPanelHandlers();
}

function renderVentasPanelBody(){
  var list = filteredSales();
  var totalSales = list.length;
  var totalUnits = list.reduce(function(a,s){ return a + (Number(s.qty)||0); }, 0);

  var byChannel = sortDesc(sumBy(list, function(s){ return s.channel || 'DESCONOCIDO'; }));
  var byArticle = sortDesc(sumBy(list, function(s){ return s.article; }));

  var topChannel = byChannel[0];
  var topArticle = byArticle[0];

  var channelOptsF = ['<option value="todos">Todos los canales</option>'].concat(
    STATE.channels.map(function(c){ return '<option value="'+escapeHtml(c)+'"'+(PANEL_FILTERS.channel===c?' selected':'')+'>'+escapeHtml(c)+'</option>'; })
  ).join('');
  var articleOptsF = ['<option value="todos">Todos los artículos</option>'].concat(
    STATE.articles.slice().sort().map(function(a){ return '<option value="'+escapeHtml(a)+'"'+(PANEL_FILTERS.article===a?' selected':'')+'>'+escapeHtml(a)+'</option>'; })
  ).join('');

  function rangeOpt(v,label){ return '<option value="'+v+'"'+(PANEL_FILTERS.range===v?' selected':'')+'>'+label+'</option>'; }

  var maxChannel = byChannel.length ? byChannel[0].value : 0;
  var channelBarsHtml = byChannel.length ? byChannel.map(function(row){
    var pct = maxChannel ? Math.max(4, Math.round(row.value/maxChannel*100)) : 0;
    return '<div class="bar-row">'+
      '<div class="cat" title="'+escapeHtml(row.key)+'">'+escapeHtml(row.key)+'</div>'+
      '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:var('+channelColorVar(row.key)+')" title="'+escapeHtml(row.key)+': '+row.value+' unidades"></div>'+
      '<span class="bar-val">'+row.value+'</span></div>'+
    '</div>';
  }).join('') : '<div class="empty">Sin datos para este filtro.</div>';

  var topArticles = byArticle.slice(0, 10);
  var maxArticle = topArticles.length ? topArticles[0].value : 0;
  var articleBarsHtml = topArticles.length ? topArticles.map(function(row){
    var pct = maxArticle ? Math.max(4, Math.round(row.value/maxArticle*100)) : 0;
    return '<div class="bar-row">'+
      '<div class="cat" title="'+escapeHtml(row.key)+'">'+escapeHtml(row.key)+'</div>'+
      '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:var(--seq-400)" title="'+escapeHtml(row.key)+': '+row.value+' unidades"></div>'+
      '<span class="bar-val">'+row.value+'</span></div>'+
    '</div>';
  }).join('') : '<div class="empty">Sin datos para este filtro.</div>';

  /* matrix: top articles x channels */
  var matrixArticles = byArticle.slice(0, 10).map(function(r){ return r.key; });
  var matrix = {};
  matrixArticles.forEach(function(a){ matrix[a] = {}; });
  list.forEach(function(s){
    if(matrixArticles.indexOf(s.article) === -1) return;
    var ch = s.channel || 'DESCONOCIDO';
    matrix[s.article][ch] = (matrix[s.article][ch]||0) + (Number(s.qty)||0);
  });
  var maxCell = 0;
  matrixArticles.forEach(function(a){ STATE.channels.forEach(function(c){ maxCell = Math.max(maxCell, matrix[a][c]||0); }); });

  function cellStyle(v){
    if(!v) return { bg: 'transparent', color: 'var(--text-muted)' };
    var ratio = maxCell ? v/maxCell : 0;
    var step, color;
    if(ratio > 0.75){ step = 'var(--seq-700)'; color = '#fff'; }
    else if(ratio > 0.5){ step = 'var(--seq-550)'; color = '#fff'; }
    else if(ratio > 0.25){ step = 'var(--seq-400)'; color = 'var(--text-primary)'; }
    else { step = 'var(--seq-100)'; color = 'var(--text-primary)'; }
    return { bg: step, color: color };
  }

  var matrixHtml = '';
  if(matrixArticles.length === 0){
    matrixHtml = '<div class="empty">Sin datos para este filtro.</div>';
  } else {
    matrixHtml = '<div class="heat-table"><table><thead><tr><th>Artículo</th>'+
      STATE.channels.map(function(c){ return '<th>'+escapeHtml(c)+'</th>'; }).join('')+
      '</tr></thead><tbody>'+
      matrixArticles.map(function(a){
        return '<tr><td title="'+escapeHtml(a)+'" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escapeHtml(a)+'</td>'+
          STATE.channels.map(function(c){
            var v = matrix[a][c] || 0;
            var st = cellStyle(v);
            return '<td class="heat-cell" style="background:'+st.bg+';color:'+st.color+'">'+(v||'–')+'</td>';
          }).join('')+
        '</tr>';
      }).join('')+
      '</tbody></table></div>';
  }

  /* daily trend */
  var byDay = sumBy(list, function(s){ return s.date; });
  var days = Object.keys(byDay).sort();
  var trendHtml = renderTrendSvg(days, byDay);

  return (
    '<div class="filters">'+
      '<div class="field"><label>Rango</label><select id="filt-range">'+
        rangeOpt('todo','Todo')+rangeOpt('mes','Este mes')+rangeOpt('30d','Últimos 30 días')+rangeOpt('7d','Últimos 7 días')+rangeOpt('custom','Rango personalizado')+
      '</select></div>'+
      '<div class="field"><label>Canal</label><select id="filt-channel">'+channelOptsF+'</select></div>'+
      '<div class="field"><label>Artículo</label><select id="filt-article">'+articleOptsF+'</select></div>'+
      (PANEL_FILTERS.range === 'custom' ?
        '<div class="field" style="min-width:150px"><label>Desde</label><input type="date" id="filt-date-from" value="'+(PANEL_FILTERS.dateFrom||'')+'"></div>'+
        '<div class="field" style="min-width:150px"><label>Hasta</label><input type="date" id="filt-date-to" value="'+(PANEL_FILTERS.dateTo||'')+'"></div>'
      : '')+
      '<button class="btn secondary small" id="export-ventas-csv" type="button" style="margin-left:auto">Exportar CSV</button>'+
    '</div>'+
    '<div class="stat-grid">'+
      '<div class="stat"><div class="label">Ventas registradas</div><div class="value">'+totalSales+'</div></div>'+
      '<div class="stat"><div class="label">Unidades vendidas</div><div class="value">'+totalUnits+'</div></div>'+
      '<div class="stat"><div class="label">Canal top</div><div class="value" style="font-size:16px">'+(topChannel?escapeHtml(topChannel.key):'—')+'</div>'+
        '<div class="sub">'+(topChannel? topChannel.value+' unidades ('+Math.round(topChannel.value/(totalUnits||1)*100)+'%)' : 'Sin datos')+'</div></div>'+
      '<div class="stat"><div class="label">Artículo top</div><div class="value" style="font-size:16px" title="'+(topArticle?escapeHtml(topArticle.key):'')+'">'+(topArticle?escapeHtml(topArticle.key):'—')+'</div>'+
        '<div class="sub">'+(topArticle? topArticle.value+' unidades' : 'Sin datos')+'</div></div>'+
    '</div>'+
    '<div class="card"><h2>Ventas por canal</h2>'+channelBarsHtml+'</div>'+
    '<div class="card"><h2>Artículos más vendidos</h2>'+articleBarsHtml+'</div>'+
    '<div class="card"><h2>Qué artículo se vende más por cada canal</h2>'+matrixHtml+'</div>'+
    '<div class="card"><h2>Tendencia diaria (unidades)</h2>'+trendHtml+'</div>'
  );
}

function attachVentasPanelHandlers(){
  $('#filt-range').addEventListener('change', function(){ PANEL_FILTERS.range = this.value; renderPanel(); });
  $('#filt-channel').addEventListener('change', function(){ PANEL_FILTERS.channel = this.value; renderPanel(); });
  $('#filt-article').addEventListener('change', function(){ PANEL_FILTERS.article = this.value; renderPanel(); });
  attachPanelDateRangeHandlers('#filt-date-from', '#filt-date-to', renderPanel);
  $('#export-ventas-csv').addEventListener('click', function(){
    exportSalesCsv(filteredSales(), 'ventas_goldentist_'+todayISO()+'.csv');
  });
}

function renderMensajesPanelBody(){
  var list = filteredMessages();
  var totalAtendidos = sumField(list, 'atendidos');
  var totalNoResp = sumField(list, 'noResp');
  var totalVentaCerrada = sumField(list, 'ventaCerrada');
  var tasaRespuesta = totalAtendidos ? Math.round((totalAtendidos-totalNoResp)/totalAtendidos*100) : 0;
  var tasaCierre = totalAtendidos ? Math.round(totalVentaCerrada/totalAtendidos*100) : 0;

  var platformOptsF = ['<option value="todos">Todas las plataformas</option>'].concat(
    STATE.msgPlatforms.map(function(p){ return '<option value="'+escapeHtml(p)+'"'+(PANEL_FILTERS.msgPlatform===p?' selected':'')+'>'+escapeHtml(p)+'</option>'; })
  ).join('');

  function rangeOpt(v,label){ return '<option value="'+v+'"'+(PANEL_FILTERS.range===v?' selected':'')+'>'+label+'</option>'; }

  /* comparativo por plataforma */
  var byPlatform = STATE.msgPlatforms.map(function(p){
    var pl = list.filter(function(m){ return m.platform === p; });
    var at = sumField(pl, 'atendidos'), nr = sumField(pl, 'noResp'), vc = sumField(pl, 'ventaCerrada');
    return { platform: p, atendidos: at, noResp: nr, ventaCerrada: vc,
      tasaResp: at ? Math.round((at-nr)/at*100) : 0, tasaCierre: at ? Math.round(vc/at*100) : 0 };
  }).sort(function(a,b){ return b.atendidos - a.atendidos; });

  var comparativoHtml = byPlatform.length ? (
    '<div style="overflow-x:auto"><table><thead><tr>'+
      '<th>Plataforma</th><th>Atendidos</th><th>No resp.</th><th>Tasa resp.</th><th>Venta cerrada</th><th>Tasa cierre</th>'+
    '</tr></thead><tbody>'+
    byPlatform.map(function(r){
      return '<tr>'+
        '<td><span class="pill"><span class="swatch" style="background:var('+platformColorVar(r.platform)+')"></span>'+escapeHtml(r.platform)+'</span></td>'+
        '<td>'+r.atendidos+'</td>'+
        '<td>'+r.noResp+'</td>'+
        '<td>'+r.tasaResp+'%</td>'+
        '<td>'+r.ventaCerrada+'</td>'+
        '<td>'+r.tasaCierre+'%</td>'+
      '</tr>';
    }).join('')+
    '</tbody></table></div>'
  ) : '<div class="empty">Sin datos para este filtro.</div>';

  /* embudo: totales por etapa, en orden fijo (nunca por magnitud) */
  var stageValues = MSG_STAGES.map(function(s){ return { key:s.key, label:s.label, color:s.color, value: sumField(list, s.key) }; });
  var maxStage = Math.max.apply(null, stageValues.map(function(s){ return s.value; }).concat([0]));
  var funnelHtml = maxStage > 0 ? stageValues.map(function(s){
    var pct = maxStage ? Math.max(4, Math.round(s.value/maxStage*100)) : 0;
    return '<div class="bar-row">'+
      '<div class="cat" title="'+escapeHtml(s.label)+'">'+escapeHtml(s.label)+'</div>'+
      '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:var('+s.color+')" title="'+escapeHtml(s.label)+': '+s.value+'"></div>'+
      '<span class="bar-val">'+s.value+'</span></div>'+
    '</div>';
  }).join('') : '<div class="empty">Sin datos para este filtro.</div>';

  /* tendencia diaria de mensajes atendidos */
  var byDay = sumFieldBy(list, function(m){ return m.date; }, 'atendidos');
  var days = Object.keys(byDay).sort();
  var trendHtml = renderTrendSvg(days, byDay);

  return (
    '<div class="filters">'+
      '<div class="field"><label>Rango</label><select id="filt-msg-range">'+
        rangeOpt('todo','Todo')+rangeOpt('mes','Este mes')+rangeOpt('30d','Últimos 30 días')+rangeOpt('7d','Últimos 7 días')+rangeOpt('custom','Rango personalizado')+
      '</select></div>'+
      '<div class="field"><label>Plataforma</label><select id="filt-msg-platform">'+platformOptsF+'</select></div>'+
      (PANEL_FILTERS.range === 'custom' ?
        '<div class="field" style="min-width:150px"><label>Desde</label><input type="date" id="filt-msg-date-from" value="'+(PANEL_FILTERS.dateFrom||'')+'"></div>'+
        '<div class="field" style="min-width:150px"><label>Hasta</label><input type="date" id="filt-msg-date-to" value="'+(PANEL_FILTERS.dateTo||'')+'"></div>'
      : '')+
      '<button class="btn secondary small" id="export-mensajes-csv" type="button" style="margin-left:auto">Exportar CSV</button>'+
    '</div>'+
    '<div class="stat-grid">'+
      '<div class="stat"><div class="label">Mensajes atendidos</div><div class="value">'+totalAtendidos+'</div></div>'+
      '<div class="stat"><div class="label">Tasa de respuesta</div><div class="value">'+tasaRespuesta+'%</div>'+
        '<div class="sub">'+totalNoResp+' sin responder</div></div>'+
      '<div class="stat"><div class="label">Ventas cerradas</div><div class="value">'+totalVentaCerrada+'</div></div>'+
      '<div class="stat"><div class="label">Tasa de cierre</div><div class="value">'+tasaCierre+'%</div>'+
        '<div class="sub">de mensajes atendidos</div></div>'+
    '</div>'+
    '<div class="card"><h2>Cómo compara cada plataforma</h2>'+comparativoHtml+'</div>'+
    '<div class="card"><h2>En qué termina cada conversación</h2>'+funnelHtml+'</div>'+
    '<div class="card"><h2>Tendencia diaria de mensajes atendidos</h2>'+trendHtml+'</div>'
  );
}

function attachMensajesPanelHandlers(){
  $('#filt-msg-range').addEventListener('change', function(){ PANEL_FILTERS.range = this.value; renderPanel(); });
  $('#filt-msg-platform').addEventListener('change', function(){ PANEL_FILTERS.msgPlatform = this.value; renderPanel(); });
  attachPanelDateRangeHandlers('#filt-msg-date-from', '#filt-msg-date-to', renderPanel);
  $('#export-mensajes-csv').addEventListener('click', function(){
    exportMessagesCsv(filteredMessages(), 'mensajes_goldentist_'+todayISO()+'.csv');
  });
}

// Conecta los campos Desde/Hasta del "Rango personalizado" del Panel
// (Ventas y Mensajes comparten PANEL_FILTERS.dateFrom/dateTo, igual que ya
// comparten PANEL_FILTERS.range) — solo existen en el DOM cuando ese rango
// está seleccionado, por eso el chequeo de null antes de engancharlos.
function attachPanelDateRangeHandlers(fromSel, toSel, onChange){
  var fromEl = $(fromSel), toEl = $(toSel);
  if(!fromEl || !toEl) return;
  fromEl.addEventListener('change', function(){
    var from = this.value || null;
    if(from && PANEL_FILTERS.dateTo && from > PANEL_FILTERS.dateTo){
      toast('"Desde" no puede ser una fecha posterior a "Hasta".');
      this.value = PANEL_FILTERS.dateFrom || '';
      return;
    }
    PANEL_FILTERS.dateFrom = from;
    onChange();
  });
  toEl.addEventListener('change', function(){
    var to = this.value || null;
    if(to && PANEL_FILTERS.dateFrom && PANEL_FILTERS.dateFrom > to){
      toast('"Hasta" no puede ser una fecha anterior a "Desde".');
      this.value = PANEL_FILTERS.dateTo || '';
      return;
    }
    PANEL_FILTERS.dateTo = to;
    onChange();
  });
}

function renderTrendSvg(days, byDay){
  if(days.length === 0) return '<div class="empty">Sin datos para este filtro.</div>';
  var w = 760, h = 160, padL = 30, padR = 10, padT = 14, padB = 24;
  var values = days.map(function(d){ return byDay[d]; });
  var maxV = Math.max.apply(null, values);
  maxV = maxV <= 0 ? 1 : maxV;
  var niceMax = Math.ceil(maxV*1.15) || 1;
  var innerW = w - padL - padR, innerH = h - padT - padB;
  function x(i){ return padL + (days.length<=1 ? innerW/2 : innerW * i/(days.length-1)); }
  function y(v){ return padT + innerH - (innerH * v/niceMax); }
  var pts = values.map(function(v,i){ return x(i)+','+y(v); }).join(' ');
  var gridLines = [0,0.5,1].map(function(f){
    var yy = padT + innerH*(1-f);
    var val = Math.round(niceMax*f);
    return '<line x1="'+padL+'" y1="'+yy+'" x2="'+(w-padR)+'" y2="'+yy+'" stroke="var(--grid)" stroke-width="1"/>'+
      '<text x="4" y="'+(yy+4)+'" font-size="10" fill="var(--text-muted)">'+val+'</text>';
  }).join('');
  var dots = values.map(function(v,i){
    var title = escapeHtml(fmtDateLabel(days[i]))+': '+v+' u.';
    return '<circle cx="'+x(i)+'" cy="'+y(v)+'" r="3.5" fill="var(--s1)" stroke="var(--surface-1)" stroke-width="2"><title>'+title+'</title></circle>';
  }).join('');
  var firstLabel = fmtDateLabel(days[0]);
  var lastLabel = fmtDateLabel(days[days.length-1]);
  return '<svg viewBox="0 0 '+w+' '+h+'" style="width:100%;height:auto;max-height:180px" preserveAspectRatio="xMidYMid meet">'+
    gridLines+
    '<polyline points="'+pts+'" fill="none" stroke="var(--s1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'+
    dots+
    '<text x="'+padL+'" y="'+(h-6)+'" font-size="10" fill="var(--text-muted)">'+escapeHtml(firstLabel)+'</text>'+
    '<text x="'+(w-padR)+'" y="'+(h-6)+'" font-size="10" fill="var(--text-muted)" text-anchor="end">'+escapeHtml(lastLabel)+'</text>'+
    '</svg>';
}

/* ---------- render: catalogo (admin) ---------- */
function renderCatalogo(){
  var view = $('#view-catalogo');
  if(!ADMIN){
    view.innerHTML = '<div class="card"><div class="empty">No tienes permisos de administrador para gestionar el catálogo.</div></div>';
    return;
  }
  var usedChannels = {}, usedArticles = {}, usedSellers = {}, usedPlatforms = {}, pendingArticlesMap = {};
  STATE.sales.forEach(function(s){
    usedChannels[s.channel]=true; usedArticles[s.article]=true; usedSellers[s.seller]=true;
    if(s.article && STATE.articles.indexOf(s.article)===-1) pendingArticlesMap[s.article]=true;
  });
  STATE.messages.forEach(function(m){ usedPlatforms[m.platform]=true; });
  var pendingArticles = Object.keys(pendingArticlesMap).sort();

  function listHtml(items, usedMap, colorFn, type){
    if(items.length===0) return '<div class="empty">Sin elementos.</div>';
    return '<div class="catlist">'+items.map(function(name){
      var inUse = !!usedMap[name];
      var swatch = colorFn ? '<span class="swatch" style="background:var('+colorFn(name)+')"></span>' : '';
      return '<div class="item">'+swatch+'<span class="name">'+escapeHtml(name)+'</span>'+
        (inUse ? '<span class="badge">en uso</span>' : '<button class="btn secondary small" data-remove-'+type+'="'+escapeHtml(name)+'" type="button">Quitar</button>')+
      '</div>';
    }).join('')+'</div>';
  }

  view.innerHTML =
    '<div class="card">'+
      '<h2>Canales de venta</h2>'+
      listHtml(STATE.channels, usedChannels, channelColorVar, 'channel')+
      '<div class="row" style="margin-top:10px">'+
        '<div class="field" style="flex:1;margin-bottom:0"><input type="text" id="new-channel" placeholder="Nuevo canal, ej. WHATSAPP"></div>'+
        '<button class="btn secondary" id="add-channel" type="button">Agregar canal</button>'+
      '</div>'+
    '</div>'+
    '<div class="card">'+
      '<h2>Vendedoras</h2>'+
      listHtml(STATE.sellers, usedSellers, null, 'seller')+
      '<p class="hint" style="margin:6px 0 0">"'+escapeHtml(SELLER_OTHER)+'" siempre está disponible como opción y no se puede quitar.</p>'+
      '<div class="row" style="margin-top:10px">'+
        '<div class="field" style="flex:1;margin-bottom:0"><input type="text" id="new-seller" placeholder="Nueva vendedora"></div>'+
        '<button class="btn secondary" id="add-seller" type="button">Agregar vendedora</button>'+
      '</div>'+
    '</div>'+
    '<div class="card">'+
      '<h2>Plataformas de mensajes</h2>'+
      listHtml(STATE.msgPlatforms, usedPlatforms, platformColorVar, 'platform')+
      '<div class="row" style="margin-top:10px">'+
        '<div class="field" style="flex:1;margin-bottom:0"><input type="text" id="new-platform" placeholder="Nueva plataforma, ej. TIKTOK"></div>'+
        '<button class="btn secondary" id="add-platform" type="button">Agregar plataforma</button>'+
      '</div>'+
    '</div>'+
    '<div class="card">'+
      '<h2>Catálogo de artículos</h2>'+
      listHtml(STATE.articles.slice().sort(), usedArticles, null, 'article')+
      '<div class="row" style="margin-top:10px">'+
        '<div class="field" style="flex:1;margin-bottom:0"><input type="text" id="new-article" placeholder="Nuevo artículo"></div>'+
        '<button class="btn secondary" id="add-article" type="button">Agregar artículo</button>'+
      '</div>'+
    '</div>'+
    (pendingArticles.length ? (
    '<div class="card">'+
      '<h2>Artículos pendientes por catalogar</h2>'+
      '<p class="hint" style="margin-bottom:10px">Se registraron ventas con estos nombres marcados como "artículo nuevo". Agrégalos al catálogo (o edita la venta para corregir el nombre).</p>'+
      '<div class="catlist">'+pendingArticles.map(function(name){
        return '<div class="item"><span class="name">'+escapeHtml(name)+'</span>'+
          '<button class="btn secondary small" data-add-pending-article="'+escapeHtml(name)+'" type="button">Agregar al catálogo</button>'+
        '</div>';
      }).join('')+'</div>'+
    '</div>'
    ) : '')+
    '<div class="card">'+
      '<h2>Seguridad</h2>'+
      '<p class="hint" style="margin:0 0 8px">Ahora toda la app pide iniciar sesión (correo y contraseña) — nadie puede ver ni capturar nada sin una cuenta. Cualquier cuenta del equipo puede usar Ventas/Mensajes/Envíos/Apartados; solo las cuentas marcadas como administradoras (tabla <code>admins</code> en Supabase) pueden ver este Panel y modificar canales, vendedoras, artículos o plataformas.</p>'+
      '<p class="hint" style="margin:0">Para crear una cuenta nueva del equipo, marcar a alguien como administrador, o cambiar una contraseña, hazlo desde tu proyecto de Supabase → Authentication → Users (y la tabla <code>admins</code> desde el SQL Editor) — ver la guía de despliegue.</p>'+
    '</div>'+
    '<div class="card"><h2>Datos</h2>'+
      '<p class="hint" style="margin:0 0 12px">Las ventas, mensajes, envíos y apartados viven en tu base de datos (Supabase). Descarga un respaldo completo en CSV cuando quieras, o consúltalos como hoja de cálculo desde el Table Editor de tu proyecto.</p>'+
      '<div class="row">'+
        '<button class="btn secondary small" id="export-all-sales-csv" type="button">Exportar todas las ventas (CSV)</button>'+
        '<button class="btn secondary small" id="export-all-messages-csv" type="button">Exportar todos los mensajes (CSV)</button>'+
        '<button class="btn secondary small" id="export-all-shipments-csv" type="button">Exportar todos los envíos (CSV)</button>'+
        '<button class="btn secondary small" id="export-all-layaways-csv" type="button">Exportar todos los apartados (CSV)</button>'+
      '</div>'+
    '</div>';

  $('#export-all-sales-csv').addEventListener('click', function(){
    exportSalesCsv(STATE.sales, 'ventas_goldentist_completo_'+todayISO()+'.csv');
  });
  $('#export-all-messages-csv').addEventListener('click', function(){
    exportMessagesCsv(STATE.messages, 'mensajes_goldentist_completo_'+todayISO()+'.csv');
  });
  $('#export-all-shipments-csv').addEventListener('click', function(){
    exportShipmentsCsv(STATE.shipments, 'envios_goldentist_completo_'+todayISO()+'.csv');
  });
  $('#export-all-layaways-csv').addEventListener('click', function(){
    exportLayawaysCsv(STATE.layaways, 'apartados_goldentist_completo_'+todayISO()+'.csv');
  });

  $('#add-channel').addEventListener('click', function(){
    var v = $('#new-channel').value.trim().toUpperCase();
    if(!v) return;
    if(STATE.channels.indexOf(v) !== -1){ toast('Ese canal ya existe.'); return; }
    addCatalogName('channels', v, { onSuccess: function(){ toast('Canal agregado'); } });
  });
  $('#add-article').addEventListener('click', function(){
    var v = $('#new-article').value.trim();
    if(!v) return;
    if(STATE.articles.indexOf(v) !== -1){ toast('Ese artículo ya existe.'); return; }
    addCatalogName('articles', v, { onSuccess: function(){ toast('Artículo agregado'); } });
  });
  $('#add-seller').addEventListener('click', function(){
    var v = $('#new-seller').value.trim();
    if(!v) return;
    if(normName(v) === normName(SELLER_OTHER)){ toast('Ese nombre está reservado.'); return; }
    if(STATE.sellers.some(function(s){ return normName(s)===normName(v); })){ toast('Esa vendedora ya existe.'); return; }
    addCatalogName('sellers', v, { onSuccess: function(){ toast('Vendedora agregada'); } });
  });
  $all('[data-remove-seller]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var name = btn.getAttribute('data-remove-seller');
      removeCatalogByName('sellers', name, {});
    });
  });
  $('#add-platform').addEventListener('click', function(){
    var v = $('#new-platform').value.trim().toUpperCase();
    if(!v) return;
    if(STATE.msgPlatforms.indexOf(v) !== -1){ toast('Esa plataforma ya existe.'); return; }
    addCatalogName('message_platforms', v, { onSuccess: function(){ toast('Plataforma agregada'); } });
  });
  $all('[data-remove-platform]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var name = btn.getAttribute('data-remove-platform');
      removeCatalogByName('message_platforms', name, {});
    });
  });
  $all('[data-remove-channel]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var name = btn.getAttribute('data-remove-channel');
      removeCatalogByName('channels', name, {});
    });
  });
  $all('[data-add-pending-article]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var name = btn.getAttribute('data-add-pending-article');
      addCatalogName('articles', name, { onSuccess: function(){ toast('Artículo agregado al catálogo'); } });
    });
  });
  $all('[data-remove-article]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var name = btn.getAttribute('data-remove-article');
      removeCatalogByName('articles', name, {});
    });
  });
}

/* ---------- login obligatorio (Supabase Auth) ----------
   Antes, la app se podia usar sin iniciar sesion (Ventas/Mensajes/Envios/
   Apartados eran publicos) y solo Panel/Catalogo pedian una cuenta. Ahora
   TODO el equipo necesita su propia cuenta para ver o capturar cualquier
   cosa; "ser admin" (ver Panel, editar Catalogo) es un permiso aparte,
   determinado por la tabla `admins` en Supabase (ver 010_login_requerido.sql),
   no por el simple hecho de haber iniciado sesion. */

function showLoginGate(){
  var gate = document.getElementById('login-gate');
  var root = document.getElementById('root');
  if(gate) gate.hidden = false;
  if(root) root.hidden = true;
  // Deja el formulario listo para un siguiente intento (p.ej. tras cerrar
  // sesión): sin esto, el botón "Entrar" se quedaría deshabilitado para
  // siempre después del primer intento de login de la sesión del navegador.
  var passInput = $('#login-password');
  var errEl = $('#login-err');
  var okBtn = $('#login-ok');
  if(passInput) passInput.value = '';
  if(errEl) errEl.textContent = '';
  if(okBtn) okBtn.disabled = false;
}

function showApp(){
  var gate = document.getElementById('login-gate');
  var root = document.getElementById('root');
  if(gate) gate.hidden = true;
  if(root) root.hidden = false;
}

function checkIsAdmin(userId){
  return supabaseClient.from('admins').select('user_id').eq('user_id', userId).then(function(res){
    if(res.error) throw res.error;
    return !!(res.data && res.data.length);
  });
}

/* Se llama justo despues de tener una sesion valida (ya sea al cargar la
   pagina con una sesion previa, o justo despues de iniciar sesion a mano):
   revisa si esa cuenta es admin, carga los datos, y muestra la app. */
function afterLogin(session){
  CURRENT_USER_EMAIL = (session.user && session.user.email) || '';
  return checkIsAdmin(session.user.id).then(function(isAdmin){
    ADMIN = isAdmin;
    return loadState();
  }).then(function(){
    showApp();
    render();
  });
}

function attemptLogin(){
  var emailInput = $('#login-email');
  var passInput = $('#login-password');
  var okBtn = $('#login-ok');
  var errEl = $('#login-err');
  var email = emailInput.value.trim();
  var password = passInput.value;
  if(!email || !password){
    errEl.textContent = 'Escribe tu correo y contraseña.';
    return;
  }
  okBtn.disabled = true;
  errEl.textContent = '';
  supabaseClient.auth.signInWithPassword({ email: email, password: password }).then(function(res){
    if(res.error){
      okBtn.disabled = false;
      errEl.textContent = 'Correo o contraseña incorrectos.';
      return;
    }
    return afterLogin(res.data.session).catch(function(err){
      okBtn.disabled = false;
      console.error(err);
      errEl.textContent = 'No se pudo cargar la información. Intenta de nuevo.';
    });
  }).catch(function(err){
    okBtn.disabled = false;
    console.error(err);
    errEl.textContent = 'No se pudo conectar. Intenta de nuevo.';
  });
}

/* ---------- global handlers ---------- */
function attachGlobalHandlers(){
  $('#tabs').addEventListener('click', function(e){
    var btn = e.target.closest('button[data-tab]');
    if(!btn) return;
    CURRENT_TAB = btn.dataset.tab;
    render();
  });
  $('#logout-btn').addEventListener('click', function(){
    supabaseClient.auth.signOut().then(function(){
      ADMIN = false;
      CURRENT_USER_EMAIL = '';
      STATE = null;
      CURRENT_TAB = 'registrar';
      showLoginGate();
    });
  });
  $('#login-ok').addEventListener('click', attemptLogin);
  $('#login-password').addEventListener('keydown', function(e){ if(e.key==='Enter') attemptLogin(); });
}

/* ---------- boot ---------- */
function boot(){
  supabaseClient = initSupabase();
  if(!supabaseClient){
    showApp();
    document.getElementById('root').innerHTML =
      '<div class="card"><h2>Falta configuración</h2>'+
      '<p>No se encontró SUPABASE_URL / SUPABASE_ANON_KEY (revisa config.js) o no cargó la librería de Supabase.</p></div>';
    return;
  }

  attachGlobalHandlers();

  supabaseClient.auth.getSession().then(function(res){
    var session = res.data && res.data.session;
    if(!session){
      showLoginGate();
      return;
    }
    return afterLogin(session);
  }).catch(function(err){
    console.error(err);
    showApp();
    document.getElementById('root').innerHTML =
      '<div class="card"><h2>No se pudo cargar la información</h2>'+
      '<p>Revisa tu conexión, o que las tablas y políticas de schema.sql ya se hayan creado en Supabase.</p></div>';
  });
}

document.addEventListener('DOMContentLoaded', boot);
