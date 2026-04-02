from ddgs import DDGS

def debug():
    query = "Milli Eğitim Bakanlığı"
    tag_phrase = query.lower()
    print(f"Tag Phrase for Filtering: '{tag_phrase}'")
    
    with DDGS() as ddgs:
        exact_q = f'"{query}"'
        print(f"DuckDuckGo Query: {exact_q}")
        search_results = ddgs.text(
            query=f"{exact_q} site:x.com OR site:twitter.com",
            region="tr-tr",
            max_results=5
        )
        print(f"Raw Items from DDGS ({len(search_results)}):")
        for i, item in enumerate(search_results):
            title = item.get("title", "")
            body = item.get("body", "")
            url = item.get("href", "")
            
            t_match = tag_phrase in title.lower()
            b_match = tag_phrase in body.lower()
            print(f"\n[{i+1}] {url}")
            print(f"Title: {title} | matches: {t_match}")
            print(f"Body : {body[:100]}... | matches: {b_match}")

if __name__ == "__main__":
    debug()
