// Servidor simulado de Supabase y Cloudflare para probar el instalador sin cuentas reales.
// Devuelve una función con la misma forma que fetch. `ejecutarSql(ref, sql)` es opcional:
// si se pasa, las consultas se ejecutan de verdad (por ejemplo, en un PostgreSQL local).
export function apiSimulada({ ejecutarSql = null, estadoInicial = 'COMING_UP', subdominio = null, limiteProyectos = 99 } = {}) {
  const estado = {
    proyectos: [], consultas: [], auth: {}, claves: {}, pages: [], llamadas: [], esperas: 0,
  };
  const json = (status, cuerpo) => new Response(cuerpo === undefined ? '' : JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
  let n = 0;
  const fetchFn = async (url, { method = 'GET', headers = {}, body } = {}) => {
    const u = new URL(url);
    const ruta = u.pathname;
    estado.llamadas.push(`${method} ${ruta}`);
    const datos = body ? JSON.parse(body) : null;
    const token = (headers.Authorization || '').replace('Bearer ', '');
    if (u.host === 'cf.test') {
      if (token !== 'cf-token') return json(403, { success: false, errors: [{ message: 'Authentication error' }] });
      if (method === 'GET' && ruta === '/client/v4/accounts') return json(200, { success: true, result: [{ id: 'cuenta123', name: 'Mi cuenta' }] });
      let m = ruta.match(/^\/client\/v4\/accounts\/(\w+)\/pages\/projects(?:\/([\w-]+))?$/);
      if (m) {
        if (method === 'GET') {
          const p = estado.pages.find((x) => x.name === m[2]);
          return p ? json(200, { success: true, result: p }) : json(404, { success: false, errors: [{ code: 8000007, message: 'Project not found' }] });
        }
        if (method === 'POST') {
          const p = { name: datos.name, production_branch: datos.production_branch, subdomain: subdominio || `${datos.name}.pages.dev` };
          estado.pages.push(p);
          return json(200, { success: true, result: p });
        }
      }
      return json(404, { success: false });
    }
    if (token !== 'sb-token') return json(401, { message: 'Unauthorized' });
    if (method === 'GET' && ruta === '/v1/organizations') return json(200, [{ id: 'org1', slug: 'org-slug', name: 'Mi org' }]);
    if (method === 'GET' && ruta === '/v1/projects') return json(200, estado.proyectos.map(({ ref, name, status }) => ({ ref, name, status })));
    if (method === 'POST' && ruta === '/v1/projects') {
      if (!datos.db_pass || !datos.organization_slug || !datos.name) return json(400, { message: 'faltan datos' });
      if (estado.proyectos.length >= limiteProyectos) return json(402, { message: 'The following organization members have reached their maximum limits for the number of active free projects' });
      n += 1;
      const ref = `proyectodeprueba${String.fromCharCode(96 + n).repeat(4)}`; // 20 letras, como las de Supabase
      const p = { ref, name: datos.name, region: datos.region, status: estadoInicial, db_pass: datos.db_pass };
      estado.proyectos.push(p);
      return json(201, { ref, name: p.name, status: p.status });
    }
    const m = ruta.match(/^\/v1\/projects\/(\w+)(\/.*)?$/);
    if (m) {
      const p = estado.proyectos.find((x) => x.ref === m[1]);
      if (!p) return json(404, { message: 'no existe' });
      const resto = m[2] || '';
      if (method === 'GET' && resto === '') {
        if (p.status === 'COMING_UP') { estado.esperas += 1; p.status = 'ACTIVE_HEALTHY'; return json(200, { ref: p.ref, name: p.name, status: 'COMING_UP' }); }
        return json(200, { ref: p.ref, name: p.name, status: p.status });
      }
      if (method === 'POST' && resto === '/restore') { if (p.status !== 'INACTIVE') return json(400, { message: 'no está pausado' }); p.status = 'COMING_UP'; estado.reactivadas = (estado.reactivadas || 0) + 1; return json(200, {}); }
      if (method === 'PATCH' && resto === '/database/password') { p.db_pass = datos.password; return json(200, { message: 'ok' }); }
      if (method === 'POST' && resto === '/database/query') {
        estado.consultas.push({ ref: p.ref, query: datos.query });
        if (ejecutarSql) {
          try { return json(201, await ejecutarSql(p.ref, datos.query)); } catch (e) { return json(400, { message: e.message }); }
        }
        return json(201, []);
      }
      if (method === 'PATCH' && resto === '/config/auth') { estado.auth[p.ref] = { ...(estado.auth[p.ref] || {}), ...datos }; return json(200, estado.auth[p.ref]); }
      if (method === 'GET' && resto.startsWith('/api-keys')) {
        return json(200, [
          { name: 'anon', type: 'legacy', api_key: 'eyJ.legacy.anon' },
          { name: 'default', type: 'publishable', api_key: `sb_publishable_${p.ref}` },
          { name: 'default', type: 'secret', api_key: u.searchParams.get('reveal') === 'true' ? 'sb_secret_xxx' : 'sb_secret_••••' },
        ]);
      }
      if (method === 'GET' && resto === '/config/database/pooler') {
        return json(200, [{ database_type: 'PRIMARY', db_user: `postgres.${p.ref}`, db_host: 'aws-0-sa-east-1.pooler.supabase.com', db_port: 6543, db_name: 'postgres', pool_mode: 'transaction' }]);
      }
    }
    return json(404, { message: `sin simular: ${method} ${ruta}` });
  };
  return { fetchFn, estado };
}

export const ENV_PRUEBA = {
  SUPABASE_ACCESS_TOKEN: 'sb-token',
  CLOUDFLARE_API_TOKEN: 'cf-token',
  CLAVE_RESPALDO: 'una-clave-de-respaldo-larga',
  GMAIL_CLAVE_APLICACION: 'abcd efgh ijkl mnop',
  NOMBRE_INSTITUCION: 'Club Atlético Las Palmas',
  CORREO_PROYECTO: 'Inscripciones.LasPalmas@gmail.com',
  CORREO_RESPONSABLE: 'Marta.Lopez@gmail.com',
  NOMBRE_RESPONSABLE: "Marta O'Connor",
  SUPABASE_API: 'https://sb.test',
  CLOUDFLARE_API: 'https://cf.test/client/v4',
};
