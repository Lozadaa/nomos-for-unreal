// `claude -p` falso (hito 30): eco de argumentos y stdin, y una marca NOMOS_DONE; con «espera» en stdin se queda vivo.
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  console.log(`ARGS ${process.argv.slice(2).join(' ')}`);
  console.log(`STDIN ${input.trim()}`);
  if (input.includes('espera')) { setInterval(() => {}, 1000); return; }
  console.log('NOMOS_DONE {"summary":"Hecho por proceso","commits":[],"tests":"passed"}');
});
