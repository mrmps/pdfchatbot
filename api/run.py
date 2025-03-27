import os
from api.index import app

# Optimize for serverless by disabling auto-reload and debug mode 
# and setting a reasonable timeout for the workers
if __name__ == "__main__":
    import uvicorn
    # Use development settings locally
    uvicorn.run("api.index:app", host="127.0.0.1", port=8000, reload=True)
else:
    # In production (Vercel), optimize for serverless
    app.debug = False 