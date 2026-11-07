"""Editor caliente de Nomos (x10).

Se lanza una vez con `-ExecCmds="py ..."` y se queda abierto: en cada tick del editor ejecuta los trabajos que
`nomos ue py` deja en NOMOS_CALIENTE/entrada (JSON con script, env e id) y escribe el resultado en salida/<id>.json.
Cada script corre como con -ExecutePythonScript (`__name__ == '__main__'`, su env en os.environ), así que los
nomos_*.py de siempre sirven sin cambios. Cierra el editor tras NOMOS_CALIENTE_INACTIVO segundos sin trabajo
o con un trabajo `salir`.
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
estado = {'ultimo': time.time(), 'latido': 0.0, 'fin': False, 'desde': time.time(), 'trabajos': 0}


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
    salida, ok, error, t0 = io.StringIO(), True, None, time.time()
    antes = dict(os.environ)
    os.environ.update(trabajo.get('env') or {})
    try:
        with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(salida):
            with open(trabajo['script'], encoding='utf-8') as f:
                codigo = compile(f.read(), trabajo['script'], 'exec')
            exec(codigo, {'__name__': '__main__', '__file__': trabajo['script']})
    except SystemExit as e:
        ok = e.code in (None, 0)
    except BaseException:
        ok, error = False, traceback.format_exc()
    finally:
        os.environ.clear()
        os.environ.update(antes)
    estado['trabajos'] += 1
    escribe(os.path.join(SALIDA, trabajo['id'] + '.json'),
            {'ok': ok, 'salida': salida.getvalue(), 'error': error, 'ms': round((time.time() - t0) * 1000)})


def tick(_dt):
    ahora = time.time()
    for ruta in sorted(glob.glob(os.path.join(ENTRADA, '*.json'))):
        try:
            ejecuta(ruta)
        except Exception:
            unreal.log_error('nomos_caliente: ' + traceback.format_exc())
        estado['ultimo'] = ahora = time.time()
    if ahora - estado['latido'] >= 1:
        escribe(LATIDO, {'pid': os.getpid(), 'en': ahora, 'desde': estado['desde'], 'trabajos': estado['trabajos']})
        estado['latido'] = ahora
    if estado['fin'] or ahora - estado['ultimo'] > INACTIVO:
        unreal.unregister_slate_post_tick_callback(manejador)
        try:
            os.remove(LATIDO)
        except OSError:
            pass
        unreal.SystemLibrary.quit_editor()


manejador = unreal.register_slate_post_tick_callback(tick)
