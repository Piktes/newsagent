from ddgs import DDGS
try:
    items = list(DDGS().text('"Ersin KARAMAN" twitter', max_results=10))
    print(f"Twitter: {len(items)} items")
    for i in items:
        print(i['href'])
    
    items2 = list(DDGS().text('"Ersin KARAMAN" instagram', max_results=10))
    print(f"\nInsta: {len(items2)} items")
    for i in items2:
        print(i['href'])
        
    items3 = list(DDGS().text('"Ersin KARAMAN" ekşi sözlük', max_results=10))
    print(f"\nEksi: {len(items3)} items")
    for i in items3:
        print(i['href'])
except Exception as e:
    print(f"Error: {e}")
