# Pakbon-app

Op je telefoon: **Vernieuwen** → **Pakbonnen (PDF)** → openen in de Fichero-app → inpakken → **Markeer als verzonden**.
De pakbon heeft dezelfde opmaak als die uit je bol-app.

## 1. In je Repl zetten

1. Open je Repl in Replit.
2. Klik in het bestandenpaneel op de drie puntjes → **Show hidden files**.
3. Verwijder alle bestaande bestanden en mappen (het lege sjabloon), ook `.replit`.
4. Sleep alle bestanden en mappen uit deze map (`pakbon-app`) in het bestandenpaneel, ook `.replit`.
   De map `node_modules` hoeft niet mee; die maakt Replit zelf.
5. Klik op **Run**. Bovenaan verschijnt een voorbeeldvenster met de inlogpagina.

## 2. Secrets invullen

Klik links op **Secrets** (slotje) en voeg toe:

| Sleutel | Waarde |
|---|---|
| `APP_PASSWORD` | het wachtwoord waarmee je in de app inlogt |
| `BOL_CLIENT_ID` | bol API Client ID (dezelfde als in je Mendix-app) |
| `BOL_CLIENT_SECRET` | bol API Client Secret |
| `BOL_TRANSPORTER_CODE` | optioneel; standaard `TNT` (PostNL, zonder track & trace) |
| `EBAY_ENV` | `sandbox` om te testen, later `production` |
| `EBAY_CLIENT_ID` | eBay App ID (Client ID) |
| `EBAY_CLIENT_SECRET` | eBay Cert ID (Client Secret) |
| `EBAY_RUNAME` | eBay RuName (Redirect URL name) |
| `EBAY_VERIFICATION_TOKEN` | zelf verzonnen code van 32-80 tekens (letters, cijfers, `_` en `-`) |

Zonder bol- en eBay-secrets staat de app in **testmodus** met twee verzonnen bestellingen.
Zodra de bol-secrets erin staan en je de testmodus uitzet (Instellingen), zie je je echte bol-bestellingen.
bol en eBay komen samen in één lijst en op één pakbon-PDF; elk kanaal heeft een eigen label.

**Verzonden melden bij bol:** de knop in de app meldt de bestelling als verzonden met PostNL (TNT), zonder track & trace,
voor brievenbuspost met postzegels. Verstuur je een grotere bestelling als pakket met track & trace? Meld die dan zoals altijd
in het bol-portaal en druk in de app niet op Verzonden. Na Vernieuwen verdwijnt hij vanzelf uit de lijst.
Je kunt ook altijd alles in het bol-portaal blijven melden; de app is dan alleen voor de pakbonnen.

De bol Client ID en Secret vind je in het bol partnerplatform → **Instellingen** → **API-instellingen**
(of je kopieert ze uit je Mendix-app bij Account).

## 3. Online zetten (zodat je telefoon erbij kan)

Klik op **Deploy** → **Autoscale** → **Deploy**. Je krijgt een vast webadres (`...replit.app`).
Zet de Secrets ook bij de deployment (meestal gaat dat automatisch). Wat dit kost zie je in Replit voordat je bevestigt.

## 4. eBay koppelen

Op developer.ebay.com, bij je keyset:

1. **User Tokens** → **Get a Token from eBay via Your Application** → maak een **RuName** aan.
   - *Auth accepted URL*: `https://<jouw-adres>.replit.app/auth/ebay/callback`
   - *Privacy policy URL*: mag je webadres zijn.
   - De RuName-naam is je `EBAY_RUNAME`.
2. **Alerts & Notifications** → **Marketplace Account Deletion**:
   - Endpoint: `https://<jouw-adres>.replit.app/ebay/account-deletion`
   - Verification token: dezelfde waarde als `EBAY_VERIFICATION_TOKEN`.
   - Klik op **Save**; eBay controleert dan of het adres werkt.
3. Open de app → **Instellingen** → **Koppel eBay-account** en log in bij eBay.

Beide adressen staan ook in de app bij **Instellingen**.

## 5. EAN op de pakbon

eBay geeft bij een bestelling het **Aangepast label (SKU)** door. Zet dat in elke advertentie op de EAN,
dan staat de EAN op de pakbon.

## Wat de app bewaart

Alleen de eBay-sleutel en welke bestellingen al geprint zijn (bestelnummers, geen adressen).
Klantgegevens worden bij elk verzoek vers bij bol en eBay opgehaald en niet opgeslagen.
