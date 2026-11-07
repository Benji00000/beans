import re, os, sys
root = os.path.dirname(os.path.abspath(__file__))
html = open(os.path.join(root, 'index.html')).read()
block = re.search(r'<!--SCRIPTS-->(.*?)<!--/SCRIPTS-->', html, re.S)
srcs = re.findall(r'src="([^"]+)"', block.group(1))
def inline(extra=''):
    parts = []
    if extra: parts.append('<script>' + extra + '</script>')
    for s in srcs:
        js = open(os.path.join(root, s)).read().replace('</script', '<\\/script')
        parts.append('<script>/* ' + s + ' */\n' + js + '\n</script>')
    return '\n'.join(parts)
os.makedirs(os.path.join(root, 'dist'), exist_ok=True)
full = html[:block.start()] + inline() + html[block.end():]
open(os.path.join(root, 'dist', 'index.html'), 'w').write(full)
# artifact version: no skeleton tags, online disabled
head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
head = re.sub(r'<meta charset[^>]*>\s*', '', head)
head = re.sub(r'<meta name="viewport"[^>]*>\s*', '', head)
head = head.replace('<title>Beans</title>', '<title>Beans</title>')
body = body[:body.index('<!--SCRIPTS-->')] + inline('window.B = window.B || {}; B.NO_ONLINE = true;') + body[body.index('<!--/SCRIPTS-->') + len('<!--/SCRIPTS-->'):]
art = head.strip() + '\n' + body.strip() + '\n'
os.makedirs(os.path.join(root, 'artifact'), exist_ok=True)
open(os.path.join(root, 'artifact', 'beans.html'), 'w').write(art)
print('dist', len(full), 'artifact', len(art))
