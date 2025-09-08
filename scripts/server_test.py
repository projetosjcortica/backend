import requests

def do_req(url, params=None, method='GET'):
    if method == 'GET':
        response = requests.get(url, params=params)
    elif method == 'POST':
        response = requests.post(url, json=params)
    return response.json()


print(do_req('http://localhost:3000'))

