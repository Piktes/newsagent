from ddgs import DDGS
try:
    items = list(DDGS().text('"Milli Eğitim Bakanlığı" twitter', max_results=10))
    print(items)
except Exception as e:
    print(f"Error: {e}")
