// cliente_mcp.mjs - Cliente MCP minimo por stdio, sin dependencias.
// Uso: node cliente_mcp.mjs
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { appendFileSync, writeFileSync } from 'node:fs';

const COMANDO = 'npx -y @modelcontextprotocol/server-filesystem .';
const TRAZA = 'salida/traza.jsonl';

// 1. El cliente lanza el servidor como proceso hijo (transporte stdio).
const servidor = spawn(COMANDO, {
  shell: true,
  stdio: ['pipe', 'pipe', 'inherit'],
});

const pendientes = new Map();
let siguienteId = 1;

function registrar(direccion, mensaje) {
  console.log(`\n${direccion}`);
  console.log(JSON.stringify(mensaje, null, 2));
  appendFileSync(TRAZA, JSON.stringify({ direccion, mensaje }) + '\n');
}

// 2. Cada mensaje es un objeto JSON en una sola linea.
function enviar(mensaje) {
  registrar('CLIENTE -> SERVIDOR', mensaje);
  servidor.stdin.write(JSON.stringify(mensaje) + '\n');
}

// Una solicitud lleva "id" y espera una respuesta con el mismo "id".
function solicitar(method, params) {
  const id = siguienteId++;
  enviar({ jsonrpc: '2.0', id, method, params });
  return new Promise((resolver) => pendientes.set(id, resolver));
}

// Una notificacion no lleva "id" y no recibe respuesta.
function notificar(method) {
  enviar({ jsonrpc: '2.0', method });
}

// 3. El cliente lee las respuestas del servidor, una por linea.
createInterface({ input: servidor.stdout }).on('line', (linea) => {
  let mensaje;
  try {
    mensaje = JSON.parse(linea);
  } catch {
    return;
  }
  registrar('SERVIDOR -> CLIENTE', mensaje);
  pendientes.get(mensaje.id)?.(mensaje);
});

// 4. La conversacion.
writeFileSync(TRAZA, '');

await solicitar('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'cliente-minimo', version: '1.0.0' },
});

notificar('notifications/initialized');

await solicitar('tools/list', {});

await solicitar('tools/call', {
  name: 'list_directory',
  arguments: { path: 'datos' },
});

// Actividad C: Tres solicitudes adicionales
// 1. Una lectura correcta
await solicitar('tools/call', {
  name: 'read_text_file',
  arguments: { path: 'datos/calificaciones.csv' },
});

// 2. Una lectura prohibida (fuera de la carpeta permitida)
await solicitar('tools/call', {
  name: 'read_text_file',
  arguments: { path: 'C:/Windows/win.ini' },
});

// 3. Un metodo que no existe (error de protocolo)
await solicitar('herramientas/inventada', {});

// 5. Al cerrar la entrada del servidor, este termina.
servidor.stdin.end();
