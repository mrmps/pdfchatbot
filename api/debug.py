#!/usr/bin/env python3
"""
Debug script to test FastAPI endpoints.
Run this script to check if the FastAPI app is working properly.
"""

import requests
import os
import sys
import time
import json
from urllib.parse import urljoin

def test_endpoint(base_url, endpoint, method="GET", params=None, data=None, files=None):
    """Test an API endpoint and print the result."""
    url = urljoin(base_url, endpoint)
    print(f"\n{'='*60}")
    print(f"Testing {method} {url}")
    print(f"Params: {params}")
    print(f"{'='*60}")
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, timeout=5)
        elif method.upper() == "POST":
            response = requests.post(url, params=params, data=data, files=files, timeout=10)
        else:
            print(f"Unsupported method: {method}")
            return False
        
        print(f"Status code: {response.status_code}")
        print(f"Response headers: {dict(response.headers)}")
        
        # Try to parse as JSON
        try:
            json_response = response.json()
            print(f"JSON Response: {json.dumps(json_response, indent=2)}")
        except:
            print(f"Response: {response.text[:500]}..." if len(response.text) > 500 else f"Response: {response.text}")
        
        return response.ok
    except Exception as e:
        print(f"Error: {str(e)}")
        return False

def main():
    # Default base URL
    base_url = "http://127.0.0.1:8000"
    
    if len(sys.argv) > 1:
        base_url = sys.argv[1]
    
    print(f"Testing FastAPI endpoints at {base_url}")
    print(f"Current working directory: {os.getcwd()}")
    print(f"Python version: {sys.version}")
    
    # Test root endpoint
    test_endpoint(base_url, "/api/py")
    
    # Test list_pdf_names endpoint
    test_endpoint(base_url, "/api/py/list_pdf_names", params={"user_id": "test_user"})
    
    # Test search endpoint with minimal parameters
    test_endpoint(
        base_url, 
        "/api/py/search", 
        params={
            "user_id": "test_user",
            "query": "test query"
        }
    )
    
    # More tests could be added here
    
    print("\nDebug complete!")

if __name__ == "__main__":
    main() 