from ddgs import DDGS

print('Testing lite backend:')
try:
    res = list(DDGS().text('"Milli Eğitim Bakanlığı" site:x.com OR site:twitter.com', backend='lite', max_results=3))
    print(f"Lite returned {len(res)} results")
except Exception as e:
    print(f"Lite err: {e}")

print('\nTesting html backend:')
try:
    res = list(DDGS().text('"Milli Eğitim Bakanlığı" site:x.com OR site:twitter.com', backend='html', max_results=3))
    print(f"Html returned {len(res)} results")
except Exception as e:
    print(f"Html err: {e}")

print('\nTesting api backend:')
try:
    res = list(DDGS().text('"Milli Eğitim Bakanlığı" site:x.com OR site:twitter.com', backend='api', max_results=3))
    print(f"Api returned {len(res)} results")
except Exception as e:
    print(f"Api err: {e}")
