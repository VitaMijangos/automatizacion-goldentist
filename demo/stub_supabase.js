/* Stub minimal de supabase-js para probar app.js sin un proyecto real.
   Simula el modelo de acceso real (ver 010_login_requerido.sql): TODO
   requiere sesión iniciada (auth.role() = 'authenticated'); el catálogo
   (channels/sellers/articles/message_platforms) además requiere que la
   cuenta esté en `admins` para insertar/editar/eliminar; mx_states solo se
   lee, nunca se escribe desde la app. */
(function(){
  var STORE = {
    channels: [ {id:1,name:'FACEBOOK'}, {id:2,name:'WATTI'} ],
    sellers: [ {id:1,name:'Diana Flores'} ],
    articles: [ {id:1,name:'Kit NSK PRO'} ],
    message_platforms: [ {id:1,name:'INSTAGRAM'} ],
    sales: [ {id:1,date:'2026-08-01',channel:'FACEBOOK',article:'Kit NSK PRO',qty:2,seller:'Diana Flores'} ],
    messages: [ {id:1,date:'2026-08-01',platform:'INSTAGRAM',atendidos:5,no_resp:1,valoracion:0,propuesta:0,pago_pendiente:0,contactar_otra:0,descartados:0,venta_cerrada:1,fuera_catalogo:0} ],
    shipments: [ {id:1,no_envio:1,venta_id:'1001',customer_name:'Cliente Prueba',phone:'5500000000',email:'cliente@test.com',street:'Calle 1',neighborhood:'Centro',city:'CDMX',state:'Ciudad de México',zip:'01000',country:'MEXICO',product:'Kit NSK PRO',qty:1,date:'2026-08-01',notes:'',status:'pendiente',paqueteria:'',no_guia:''} ],
    layaways: [ {id:1,customer_name:'Cliente Apartado',phone:'5511111111',product:'Rayos X Alámbrico',qty:1,date:'2026-08-01',total_amount:39990,deposit_method:'Transferencia',status:'apartado',settle_payment_method:'',settle_date:null,notes:''} ],
    layaway_payments: [ {id:1,layaway_id:1,amount:1000,date:'2026-08-01',note:'Depósito inicial'} ],
    mx_states: ['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato','Guerrero','Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas'].map(function(n,i){ return {id:i+1,name:n}; }),
    admins: [ {user_id:'admin-uuid-1'} ]
  };
  var NEXT_ID = { channels:3, sellers:2, articles:2, message_platforms:2, sales:2, messages:2, shipments:2, layaways:2, layaway_payments:2 };
  var CATALOG_TABLES = ['channels','sellers','articles','message_platforms'];
  var DATA_TABLES = ['sales','messages','shipments','layaways','layaway_payments'];

  var authenticated = false;
  var currentUserId = null;
  var currentSession = null;
  var authCallbacks = [];

  // Dos cuentas de prueba: una admin (está en `admins`) y una del equipo
  // normal (no está) — igual que en el proyecto real, cualquiera de las dos
  // puede usar Ventas/Mensajes/Envíos/Apartados, pero solo la admin ve
  // Panel/Catálogo.
  var USERS = {
    'admin@test.com': { password: 'secret123', id: 'admin-uuid-1' },
    'vendedora@test.com': { password: 'vendedora123', id: 'team-uuid-1' }
  };

  function isAdminUser(){
    return STORE.admins.some(function(a){ return a.user_id === currentUserId; });
  }

  function notifyAuth(event, session){
    authCallbacks.forEach(function(cb){ cb(event, session); });
  }

  function QB(table){
    this.table = table;
    this.op = 'select';
    this.payload = null;
    this.filters = [];
    this.selectAfterWrite = false;
  }
  QB.prototype.select = function(cols){
    if(this.op === 'select'){ this.cols = cols; return this; }
    this.selectAfterWrite = true;
    return this;
  };
  QB.prototype.order = function(){ return this; };
  QB.prototype.eq = function(col, val){ this.filters.push([col, val]); return this; };
  QB.prototype.insert = function(payload){ this.op = 'insert'; this.payload = payload; return this; };
  QB.prototype.update = function(payload){ this.op = 'update'; this.payload = payload; return this; };
  QB.prototype.delete = function(){ this.op = 'delete'; return this; };

  QB.prototype._matches = function(row){
    return this.filters.every(function(f){ return row[f[0]] === f[1]; });
  };

  QB.prototype._execute = function(){
    var table = this.table;
    var rows = STORE[table];
    if(this.op === 'select'){
      // Todo requiere sesión iniciada, igual que la RLS real
      // (auth.role() = 'authenticated'); sin sesión, PostgREST no da un
      // error, simplemente no devuelve filas.
      if(!authenticated) return { data: [], error: null };
      var filtered = rows.filter(this._matches, this);
      return { data: filtered.slice(), error: null };
    }
    if(this.op === 'insert'){
      var isCatalog = CATALOG_TABLES.indexOf(table) !== -1;
      var isData = DATA_TABLES.indexOf(table) !== -1;
      if(isCatalog && !(authenticated && isAdminUser())){
        return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
      }
      if(isData && !authenticated){
        return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
      }
      if(isCatalog && rows.some(function(r){ return r.name === this.payload.name; }, this)){
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
      }
      var id = NEXT_ID[table]++;
      var newRow = Object.assign({ id: id }, this.payload);
      if(table === 'shipments' && !newRow.no_envio){
        // Simula el trigger de Postgres: folio automático que reinicia por
        // año, tomado de la fecha del envío.
        var year = (newRow.date || '').slice(0, 4);
        var maxNo = rows.reduce(function(max, r){
          return (String(r.date || '').slice(0, 4) === year && r.no_envio > max) ? r.no_envio : max;
        }, 0);
        newRow.no_envio = maxNo + 1;
      }
      rows.push(newRow);
      return { data: this.selectAfterWrite ? [newRow] : null, error: null };
    }
    if(this.op === 'update'){
      var isCat = CATALOG_TABLES.indexOf(table) !== -1;
      var isDat = DATA_TABLES.indexOf(table) !== -1;
      if(isCat && !(authenticated && isAdminUser())){
        return { data: [], error: null }; // RLS filtra todas las filas en silencio
      }
      if(isDat && !authenticated){
        return { data: [], error: null };
      }
      var self = this;
      var updated = [];
      rows.forEach(function(r, i){
        if(self._matches(r)){
          Object.assign(r, self.payload);
          updated.push(r);
        }
      });
      return { data: updated, error: null };
    }
    if(this.op === 'delete'){
      var isCat2 = CATALOG_TABLES.indexOf(table) !== -1;
      var isDat2 = DATA_TABLES.indexOf(table) !== -1;
      if(isCat2 && !(authenticated && isAdminUser())){
        return { data: [], error: null };
      }
      if(isDat2 && !authenticated){
        return { data: [], error: null };
      }
      var self2 = this;
      var removed = [];
      STORE[table] = rows.filter(function(r){
        if(self2._matches(r)){ removed.push(r); return false; }
        return true;
      });
      return { data: removed, error: null };
    }
    return { data: null, error: { message: 'unknown op' } };
  };

  QB.prototype.then = function(resolve, reject){
    var self = this;
    return Promise.resolve().then(function(){ return self._execute(); }).then(resolve, reject);
  };

  function createClient(url, key){
    console.log('[stub] createClient', url, key ? key.slice(0,6)+'...' : key);
    return {
      auth: {
        getSession: function(){ return Promise.resolve({ data: { session: currentSession }, error: null }); },
        onAuthStateChange: function(cb){ authCallbacks.push(cb); return { data: { subscription: { unsubscribe: function(){} } } }; },
        signInWithPassword: function(creds){
          var user = USERS[creds.email];
          if(user && user.password === creds.password){
            authenticated = true;
            currentUserId = user.id;
            currentSession = { user: { id: user.id, email: creds.email } };
            notifyAuth('SIGNED_IN', currentSession);
            return Promise.resolve({ data: { session: currentSession }, error: null });
          }
          return Promise.resolve({ data: null, error: { message: 'Invalid login credentials' } });
        },
        signOut: function(){
          authenticated = false;
          currentUserId = null;
          currentSession = null;
          notifyAuth('SIGNED_OUT', null);
          return Promise.resolve({ error: null });
        }
      },
      from: function(table){ return new QB(table); }
    };
  }

  window.supabase = { createClient: createClient };
  window.__TEST_STORE__ = STORE;
  window.__TEST_CREDS__ = {
    admin: { email: 'admin@test.com', password: 'secret123' },
    team: { email: 'vendedora@test.com', password: 'vendedora123' }
  };
})();
