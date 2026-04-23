import os
from dotenv import load_dotenv

load_dotenv(override=True)

# NewsAPI.ai (EventRegistry) system-wide API key
ER_API_KEY = os.getenv("ER_API_KEY", "5c4eb97a-6f8b-494f-8bba-4ab7337718dc")

# X (Twitter) API — App-Only Bearer Token
X_BEARER_TOKEN = os.getenv("X_BEARER_TOKEN", "")

print("CONFIG ER:", bool(ER_API_KEY), repr(ER_API_KEY[:8] if ER_API_KEY else None))
print("CONFIG X:", bool(X_BEARER_TOKEN), len(X_BEARER_TOKEN) if X_BEARER_TOKEN else None, repr(X_BEARER_TOKEN[:12] if X_BEARER_TOKEN else None))
