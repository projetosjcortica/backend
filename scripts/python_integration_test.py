import requests

BASE = 'http://localhost:3000'

print('root:', requests.get(BASE).json())
print('health:', requests.get(BASE + '/health').json())

# try upload file
files = {'file': open('../backups/Relatorio_2025_08.csv', 'rb')}
resp = requests.post(BASE + '/upload-file', files=files)
print('upload-file:', resp.status_code)
try:
    print(resp.json())
except Exception as e:
    print('no json', e)
