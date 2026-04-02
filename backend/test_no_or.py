from ddgs import DDGS

print('\nTesting api backend without OR:')
try:
    res = list(DDGS().text('"Milli Eğitim Bakanlığı" site:x.com', max_results=3))
    print(f"Api returned {len(res)} results")
except Exception as e:
    print(f"Api err: {e}")
