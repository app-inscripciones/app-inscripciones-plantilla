import { createClient } from '@supabase/supabase-js';
import conexion from '../../config/conexion.json';
import { codigoDeErrorSupabase } from './mensajes.js';

// Conexión del panel de administración (Etapa 4).
// Ingreso con código por correo (D39): Supabase Auth manda un código de 6 números
// al correo; la sesión queda guardada en este dispositivo.
let cliente = null;
export function supabase() {
  if (!cliente) {
    cliente = createClient(conexion.url, conexion.clavePublica, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'panel-sesion', detectSessionInUrl: false },
    });
  }
  return cliente;
}

export { MENSAJES_PANEL, mensajeError, problemaDefinicion } from './mensajes.js';

export const correoValido = (c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(c || '').trim());

// Llama a una función de la base con la sesión del administrador. Nunca lanza: devuelve { ok:false, error }.
export async function rpc(nombre, parametros = {}) {
  try {
    const { data, error } = await supabase().rpc(nombre, parametros);
    if (error) return { ok: false, error: codigoDeErrorSupabase(error), detalle: error.message };
    return data;
  } catch {
    return { ok: false, error: 'sin_conexion' };
  }
}

export async function pedirCodigo(correo) {
  const email = String(correo).trim().toLowerCase();
  if (!correoValido(email)) return { ok: false, error: 'correo_invalido' };
  const habilitado = await rpc('correo_habilitado', { p_email: email });
  if (habilitado && habilitado.ok === false) return habilitado;
  if (habilitado === false) return { ok: false, error: 'no_habilitado' };
  try {
    const { error } = await supabase().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) {
      if (error.status === 429 || /seconds|rate/i.test(error.message)) return { ok: false, error: 'espera' };
      if (error.status === 403 || /habilitado/i.test(error.message)) return { ok: false, error: 'no_habilitado' };
      if (/sending|smtp|email/i.test(error.message || '')) return { ok: false, error: 'correo_no_sale', detalle: error.message };
      return { ok: false, error: 'sin_conexion', detalle: error.message };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'sin_conexion' };
  }
}

export async function verificarCodigo(correo, codigo) {
  const token = String(codigo).replace(/\D/g, '');
  if (token.length < 6) return { ok: false, error: 'codigo_invalido' };
  try {
    const email = String(correo).trim().toLowerCase();
    let { error } = await supabase().auth.verifyOtp({ email, token, type: 'email' });
    // La primera vez, Supabase manda el correo de «confirmar registro»: ese código se verifica como 'signup'.
    if (error) ({ error } = await supabase().auth.verifyOtp({ email, token, type: 'signup' }));
    if (error) return { ok: false, error: 'codigo_invalido' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'sin_conexion' };
  }
}

export async function haySesion() {
  try {
    const { data } = await supabase().auth.getSession();
    return Boolean(data && data.session);
  } catch {
    return false;
  }
}

export async function salir() {
  try { await supabase().auth.signOut(); } catch { /* nada */ }
}

export const NOMBRES_ROLES = {
  responsable: 'Responsable general',
  organizador: 'Organizador',
  tesorero: 'Tesorero',
  consulta: 'Consulta',
};
