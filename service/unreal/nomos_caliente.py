"""Editor caliente de Nomos (x10).

Se lanza una vez con `-ExecCmds="py ..."` y se queda abierto: en cada tick del editor ejecuta los trabajos que
`nomos ue py` deja en NOMOS_CALIENTE/entrada (JSON con script, env e id) y escribe el resultado en salida/<id>.json.
Cada script corre como con -ExecutePythonScript (`__name__ == '__main__'`, su env en os.environ), así que los
nomos_*.py de siempre sirven sin cambios. Cierra el editor tras NOMOS_CALIENTE_INACTIVO segundos sin trabajo
o con un trabajo `salir`.

Un script que necesita varios ticks (tests de automatización, capturas) deja en su módulo `nomos_pendiente`, una
función sin argumentos: se llama en cada tick hasta que devuelve True (o lanza) y solo entonces se escribe el
resultado. Mientras, no se toma otro trabajo. Si pasa `limite` segundos (lo pone el cliente), falla por tiempo.
"""
import contextlib
import glob
import io
import json
import os
import time
import traceback

import unreal

DIR = os.environ['NOMOS_CALIENTE']
INACTIVO = float(os.environ.get('NOMOS_CALIENTE_INACTIVO', '600'))
ENTRADA, SALIDA = os.path.join(DIR, 'entrada'), os.path.join(DIR, 'salida')
LATIDO = os.path.join(DIR, 'latido.json')
os.makedirs(ENTRADA, exist_ok=True)
os.makedirs(SALIDA, exist_ok=True)
estado = {'ultimo': time.time(), 'latido': 0.0, 'fin': False, 'desde': time.time(), 'trabajos': 0, 'pendiente': None}


def escribe(ruta, datos):
    tmp = ruta + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(datos, f)
    os.replace(tmp, ruta)


def ejecuta(ruta):
    with open(ruta, encoding='utf-8') as f:
        trabajo = json.load(f)
    os.remove(ruta)
    if trabajo.get('salir'):
        estado['fin'] = True
        escribe(os.path.join(SALIDA, trabajo['id'] + '.json'), {'ok': True, 'salida': '', 'error': None, 'ms': 0})
        return
    salida, t0 = io.StringIO(), time.time()
    antes = dict(os.environ)
    os.environ.update(trabajo.get('env') or {})
    modulo = {'__name__': '__main__', '__file__': trabajo['script']}
    try:
        _, error = paso(salida, lambda: exec(compile(open(trabajo['script'], encoding='utf-8').read(), trabajo['script'], 'exec'), modulo))
    finally:
        os.environ.clear()
        os.environ.update(antes)
    if error is None and callable(modulo.get('nomos_pendiente')):
        estado['pendiente'] = {'trabajo': trabajo, 'salida': salida, 't0': t0, 'fn': modulo['nomos_pendiente']}
        return
    termina(trabajo, salida, error, t0)


def paso(salida, fn):
    """fn con stdout/stderr en `salida`: (resultado, error). SystemExit(0) es éxito; otro código, error."""
    try:
        with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(salida):
            return fn(), None
    except SystemExit as e:
        return True, None if e.code in (None, 0) else f'SystemExit({e.code})'
    except BaseException:
        return None, traceback.format_exc()


def termina(trabajo, salida, error, t0):
    estado['trabajos'] += 1
    escribe(os.path.join(SALIDA, trabajo['id'] + '.json'),
            {'ok': error is None, 'salida': salida.getvalue(), 'error': error, 'ms': round((time.time() - t0) * 1000)})


def sigue():
    """Un tick del trabajo pendiente: lo cierra si terminó, falló o pasó de su límite."""
    p = estado['pendiente']
    hecho, error = paso(p['salida'], p['fn'])
    limite = p['trabajo'].get('limite')
    if not hecho and error is None:
        if not limite or time.time() - p['t0'] <= limite:
            return
        error = f'nomos_caliente: el trabajo pasó de {limite} s'
    estado['pendiente'] = None
    termina(p['trabajo'], p['salida'], error, p['t0'])


def tick(_dt):
    ahora = time.time()
    if estado['pendiente'] is not None:
        sigue()
        estado['ultimo'] = ahora
    for ruta in sorted(glob.glob(os.path.join(ENTRADA, '*.json'))):
        if estado['pendiente'] is not None:
            break
        try:
            ejecuta(ruta)
        except Exception:
            unreal.log_error('nomos_caliente: ' + traceback.format_exc())
        estado['ultimo'] = ahora = time.time()
    if ahora - estado['latido'] >= 1:
        try:
            escribe(LATIDO, {'pid': os.getpid(), 'en': ahora, 'desde': estado['desde'], 'trabajos': estado['trabajos']})
            estado['latido'] = ahora
        except OSError:
            pass  # reemplazo bloqueado (cliente leyendo, antivirus): el siguiente tick
    if estado['fin'] or ahora - estado['ultimo'] > INACTIVO:
        unreal.unregister_slate_post_tick_callback(manejador)
        try:
            os.remove(LATIDO)
        except OSError:
            pass
        unreal.SystemLibrary.quit_editor()


manejador = unreal.register_slate_post_tick_callback(tick)
