# Runs AI-written test_* functions against solution.py and reports EXACTLY which test
# and which line failed (with got/expected for comparisons). No pytest needed.
import json, sys, os, ast, time, signal, traceback, resource
sys.path.insert(0, os.getcwd())
resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
def out(x):
    print('@@' + json.dumps(x)); sys.stdout.flush(); sys.exit(0)
def short(v, n=200):
    try: s = repr(v)
    except Exception: s = '<unprintable>'
    return s if len(s) <= n else s[:n] + '…'
SRC = open('solution.py').read().splitlines()
TST_SRC = open('test_solution.py').read()
TST = TST_SRC.splitlines()
def line_of(lines, n):
    return lines[n - 1].strip() if 0 < n <= len(lines) else ''
# 1. does solution.py even load?
try:
    exec(compile(open('solution.py').read(), 'solution.py', 'exec'), {})
except SyntaxError as e:
    out({'load_error': {'file': 'solution.py', 'line': e.lineno, 'source': line_of(SRC, e.lineno or 0), 'type': 'SyntaxError', 'message': str(e.msg)}})
except BaseException as e:
    tb = traceback.extract_tb(e.__traceback__)
    f = [x for x in tb if x.filename == 'solution.py']
    ln = f[-1].lineno if f else None
    out({'load_error': {'file': 'solution.py', 'line': ln, 'source': line_of(SRC, ln or 0), 'type': type(e).__name__, 'message': str(e)[:200]}})
# 2. load the tests
tns = {'__name__': 'test_solution'}
try:
    exec(compile(TST_SRC, 'test_solution.py', 'exec'), tns)
except SyntaxError as e:
    out({'load_error': {'file': 'test_solution.py (AI-written)', 'line': e.lineno, 'source': line_of(TST, e.lineno or 0), 'type': 'SyntaxError', 'message': str(e.msg)}})
except BaseException as e:
    tb = traceback.extract_tb(e.__traceback__)
    f = [x for x in tb if os.path.basename(x.filename) == 'test_solution.py']
    ln = f[-1].lineno if f else None
    out({'load_error': {'file': 'test_solution.py (AI-written)', 'line': ln, 'source': line_of(TST, ln or 0), 'type': type(e).__name__, 'message': str(e)[:200]}})
def explain(src, frame):
    # for `assert a == b` re-evaluate both sides so we can show got vs expected
    try:
        node = ast.parse(src.strip()).body[0]
        if not isinstance(node, ast.Assert): return None
        t = node.test
        if isinstance(t, ast.Compare) and len(t.ops) == 1:
            ev = lambda n: eval(compile(ast.Expression(n), '<x>', 'eval'), frame.f_globals, frame.f_locals)
            sym = {ast.Eq: '==', ast.NotEq: '!=', ast.Lt: '<', ast.LtE: '<=', ast.Gt: '>', ast.GtE: '>=', ast.In: 'in', ast.NotIn: 'not in', ast.Is: 'is', ast.IsNot: 'is not'}.get(type(t.ops[0]), '?')
            return {'op': sym, 'got': short(ev(t.left)), 'expected': short(ev(t.comparators[0]))}
        return {'op': 'truthy', 'got': short(eval(compile(ast.Expression(t), '<x>', 'eval'), frame.f_globals, frame.f_locals)), 'expected': 'True'}
    except Exception:
        return None
class Timeout(Exception): pass
def on_alarm(*_): raise Timeout('test took longer than 5 seconds (infinite loop?)')
signal.signal(signal.SIGALRM, on_alarm)
names = [k for k, v in tns.items() if k.startswith('test') and callable(v) and getattr(v, '__module__', None) in (None, 'test_solution')]
names.sort(key=lambda k: tns[k].__code__.co_firstlineno if hasattr(tns[k], '__code__') else 0)
res = []
for k in names:
    t0 = time.time(); signal.alarm(5)
    try:
        tns[k](); res.append({'name': k, 'ok': True, 'ms': int((time.time() - t0) * 1000)})
    except BaseException as e:
        signal.alarm(0)
        tb = traceback.extract_tb(e.__traceback__)
        tframes = [(x, fr) for x, fr in zip(tb, [t[0] for t in traceback.walk_tb(e.__traceback__)]) if os.path.basename(x.filename) == 'test_solution.py']
        r = {'name': k, 'ok': False, 'ms': int((time.time() - t0) * 1000), 'error_type': type(e).__name__, 'message': str(e)[:300]}
        if tframes:
            x, fr = tframes[-1]
            r['test_line'] = x.lineno; r['test_source'] = (x.line or line_of(TST, x.lineno)).strip()
            if isinstance(e, AssertionError):
                ex = explain(r['test_source'], fr)
                if ex: r.update(ex)
        sf = [x for x in tb if os.path.basename(x.filename) == 'solution.py']
        if sf:
            r['code_line'] = sf[-1].lineno; r['code_source'] = line_of(SRC, sf[-1].lineno); r['code_function'] = sf[-1].name
        res.append(r)
    finally:
        signal.alarm(0)
out({'tests': res})
