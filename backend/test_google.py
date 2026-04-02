from googlesearch import search

try:
    results = search('"Milli Eğitim Bakanlığı" site:twitter.com OR site:x.com', num_results=3, advanced=True)
    for res in results:
        print(f"Title: {res.title}")
        print(f"URL: {res.url}")
        print(f"Desc: {res.description}")
except Exception as e:
    print(f"Google err: {e}")
