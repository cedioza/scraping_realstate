import requests

headers = {
    "Authorization": "Bearer fdd82c86-b6cf-49df-b3bd-b1a1f4b8c560",
    "Content-Type": "application/json"
}
data = {
    "zone": "web_unlocker1",
    "url": "https://www.idealista.com/pro/sa-roqueta-investments/venta-viviendas/chipiona-cadiz/",
    "format": "raw"
}

response = requests.post(
    "https://api.brightdata.com/request",
    json=data,
    headers=headers
)
print(response.text)