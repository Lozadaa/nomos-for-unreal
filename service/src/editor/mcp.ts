/**
 * Cliente mínimo del MCP del editor de Unreal 5.9 (plugin ModelContextProtocol, Streamable HTTP en 127.0.0.1).
 * El servidor solo publica 4 meta-herramientas; las de verdad se llaman con `call_tool` (toolset + herramienta).
 * Experimental en el motor: lo usan `nomos ue compilar` y `nomos ue captura`; el resto de `ue` sigue por la cola de archivos.
 */
type McpContent = {type: string; text?: string; data?: string};
export type Mcp = {
  /** Llama a `toolset.tool`; devuelve `returnValue` (o el texto tal cual si no es JSON) y, si la hay, la imagen.
   *  Las capturas traen el PNG en el contenido; el `urn:toolresult:` de `returnValue.image` no se puede leer aparte [probado]. */
  call(toolset: string, tool: string, args?: Record<string, unknown>, timeoutMs?: number): Promise<{value: unknown; image: Buffer | null}>;
};

export async function mcpConnect(port: number, timeoutMs = 10_000): Promise<Mcp> {
  const url = `http://127.0.0.1:${port}/mcp`;
  let session: string | null = null, id = 0;
  async function rpc(method: string, params?: unknown, opts: {notify?: boolean; timeoutMs?: number} = {}): Promise<any> {
    const headers: Record<string, string> = {'content-type': 'application/json', accept: 'application/json, text/event-stream'};
    if (session) headers['mcp-session-id'] = session;
    const r = await fetch(url, {method: 'POST', headers, signal: AbortSignal.timeout(opts.timeoutMs ?? timeoutMs),
      body: JSON.stringify({jsonrpc: '2.0', method, ...(params ? {params} : {}), ...(opts.notify ? {} : {id: ++id})})});
    session ??= r.headers.get('mcp-session-id');
    if (opts.notify) return;
    const text = await r.text();
    // JSON directo o SSE: el último `data:` es la respuesta
    const json = text.trimStart().startsWith('{') ? text : text.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5)).pop();
    if (!json) throw new Error(`El MCP de Unreal respondió ${r.status} sin cuerpo a ${method}`);
    const msg = JSON.parse(json);
    if (msg.error) throw new Error(`MCP ${method}: ${msg.error.message ?? JSON.stringify(msg.error)}`);
    return msg.result;
  }
  await rpc('initialize', {protocolVersion: '2025-03-26', capabilities: {}, clientInfo: {name: 'nomos', version: '1'}});
  await rpc('notifications/initialized', undefined, {notify: true});
  return {
    async call(toolset, tool, args = {}, ms) {
      const res = await rpc('tools/call', {name: 'call_tool', arguments: {toolset_name: toolset, tool_name: tool, arguments: args}}, {timeoutMs: ms});
      const content: McpContent[] = res.content ?? [];
      const text = content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      if (res.isError) throw new Error(`${toolset}.${tool}: ${text || 'error sin mensaje'}`);
      let value: unknown = text;
      try { const parsed = JSON.parse(text); value = parsed && typeof parsed === 'object' && 'returnValue' in parsed ? parsed.returnValue : parsed; } catch { /* texto */ }
      const png = content.find(c => c.type === 'image' && c.data)?.data;
      return {value, image: png ? Buffer.from(png, 'base64') : null};
    },
  };
}
