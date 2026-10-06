# Runs the student's own one-line test cases (expressions that should be True).
import json, sys, ast, resource
resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
def short(v, n=200):
    try: s = repr(v)
    except Exception: s = '<unprintable>'
    return s if len(s) <= n else s[:n] + '…'
ns, res = {}, []
try:
    exec(open('solution.py').read(), ns)
except BaseException as e:
    print('@@' + json.dumps([{'n': 0, 'case': '(loading your code)', 'ok': False, 'error': type(e).__name__ + ': ' + str(e)[:200]}])); sys.exit(0)
for i, c in enumerate(json.load(open('cases.json')), 1):
    r = {'n': i, 'case': c}
    try:
        node = ast.parse(c, mode='eval').body
        ok = bool(eval(c, ns)); r['ok'] = ok
        if not ok and isinstance(node, ast.Compare) and len(node.ops) == 1:
            ev = lambda n: eval(compile(ast.Expression(n), '<x>', 'eval'), ns)
            r['got'] = short(ev(node.left)); r['expected'] = short(ev(node.comparators[0]))
        elif not ok:
            r['error'] = 'Expression evaluated to False'
    except BaseException as e:
        r['ok'] = False; r['error'] = type(e).__name__ + ': ' + str(e)[:200]
    res.append(r)
print('@@' + json.dumps(res))
