import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))

from engines.twitter_engine import TwitterEngine
from engines.instagram_engine import InstagramEngine
from duckduckgo_search import DDGS

def test_engines():
    print("Testing DDGS text directly:")
    try:
        with DDGS() as ddgs:
            res = ddgs.text("Milli Eğitim Bakanlığı site:x.com OR site:twitter.com", region="tr-tr", max_results=3)
            for r in res:
                print(r)
    except Exception as e:
        print(f"DDGS Error: {e}")

    print("\nTesting Twitter Engine...")
    t_engine = TwitterEngine()
    t_results = t_engine.search("Milli Eğitim Bakanlığı", max_results=5)
    print(f"Twitter Results ({len(t_results)}):")
    for r in t_results:
        print(f" - {r.title} | {r.url}")
        
    print("\nTesting Instagram Engine...")
    i_engine = InstagramEngine()
    i_results = i_engine.search("Milli Eğitim Bakanlığı", max_results=5)
    print(f"Instagram Results ({len(i_results)}):")
    for r in i_results:
        print(f" - {r.title} | {r.url}")

if __name__ == "__main__":
    test_engines()
