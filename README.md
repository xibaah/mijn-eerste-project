# mijn-eerste-project

Een routeplanner in de stijl van Strava: klik punten aan op de kaart, de route volgt automatisch wegen en paden en je ziet meteen de afstand, de hoogtemeters en het hoogteprofiel. Daarna download je de route als GPX of open je hem in Google Maps.

## Functies

- **Kaart** met vier lagen: gewone kaart, fietskaart, terrein en satelliet
- **Klikken = punt toevoegen**: de punten worden automatisch verbonden via wegen en paden
- **Sport kiezen**: fiets, racefiets, MTB, wandelen, hardlopen of rechte lijn
- **Afstand, stijgen, dalen en geschatte tijd** worden live berekend
- **Hoogteprofiel**: beweeg erover om het punt op de kaart te zien
- **Bewerken**: punten verslepen, op de route klikken om een tussenpunt toe te voegen, op een punt klikken om het te verwijderen, ongedaan maken (Ctrl+Z), omdraaien, terug naar start
- **Exporteren**: GPX downloaden (met hoogtes, werkt met Garmin, Wahoo, Strava, Komoot, …) of openen in Google Maps
- **GPX importeren** om een bestaande route te bekijken of aan te passen
- **Plaats zoeken** en **mijn locatie**
- De route wordt automatisch bewaard in je browser

## Gebruiken

Je hebt geen server, installatie of API-sleutel nodig. Open gewoon `index.html` in je browser.

Werkt dat niet goed (sommige browsers zijn streng met lokale bestanden), start dan een klein webservertje in deze map:

```bash
python3 -m http.server 8000
```

en ga naar <http://localhost:8000>.

### Online zetten met GitHub Pages

1. Ga op GitHub naar **Settings → Pages**.
2. Kies bij *Source* de branch (bv. `main`) en de map `/ (root)`.
3. Na een minuutje staat je app op `https://<gebruikersnaam>.github.io/mijn-eerste-project/`, ook op je gsm.

## Hoe het werkt

| Bestand | Wat het doet |
| --- | --- |
| `index.html` | De pagina-opbouw |
| `css/style.css` | De vormgeving (ook voor gsm) |
| `js/app.js` | Kaart, klikken, slepen, statistieken en export |
| `js/routing.js` | Routes berekenen per sport |
| `js/elevation.js` | Het hoogteprofiel |
| `js/geo.js` | Rekenwerk: afstanden, hoogtemeters, GPX en de Google Maps-link |

Gebruikte gratis diensten:

- [Leaflet](https://leafletjs.com) en [OpenStreetMap](https://www.openstreetmap.org) voor de kaart
- [BRouter](https://brouter.de) voor de routes (inclusief hoogtes)
- [Open-Meteo](https://open-meteo.com) voor hoogtes in de modus "rechte lijn"
- [Nominatim](https://nominatim.org) om plaatsen te zoeken

Hoogtemeters worden berekend met een drempel van 4 m, zodat kleine schommelingen in de hoogtedata niet meetellen. Daardoor kan het resultaat licht verschillen van Strava of Komoot.

Google Maps berekent zelf een route langs maximaal 11 van je punten. Die route kan dus iets afwijken van wat je hier tekende; voor navigatie gebruik je best het GPX-bestand.
