# Codice
Il codice è composto dai seguenti componenti:
- **handler.js**: si occupa della gestione dei livelli interpretando i file di configurazione ed eseguendo le difese implementate per il livello
- **internal-server.js**: server interno, si occupa della gestione delle richieste inoltrate a `localhost`
- **internal-server-manager.js**: classe che si occupa di avviare, stoppare e pulire le risorse del secondo server
- **server.js**: il server principale, si occupa del routing delle richieste del laboratorio SSRF.
- **state.js**: memorizza lo stato del livello a runtime
- **assets/**: contiene i file con le flag di ogni livello
- **config/**: contiene i file di configurazione dei livelli
- **defenses/defenses.js**: contiene il codice che implementa le difese per ogni livello 
- **handlers/**: contiene il codice per la gestione dei vari schemi URI
	- **file.js**: permette di usare il protocollo file:// per leggere file o ottenere il contenuto delle cartelle
	- **http.js**: interpreta l'URL ed esegue un fetch delle risorse
- **hints/**: contiene i file con i suggerimenti per la risoluzione dei livelli 
- **utils/**: questa cartella contiene tutti i moduli Javascript custom
	- **config_utils.js**: contiene il codice per la lettura dei file di configurazione
	- **errors.js**: errori custom
	- **ip.js**: contiene il codice per la gestione degli indirizzi IPv4 e IPv6
	- **miscellaneous.js**: contiene codice vario
	- **url_utils.js**: contiene il codice per l'interpretazione degli URL
- **view/**: contiene il codice per l'interfaccia grafica
	- **home.html**: codice html per la pagina di selezione del livello
	- **level.hbs**: template handlebars per l'interfaccia del livello
	- **style.css**: file di stile per l'interfaccia
# File di configurazione
### Percorso
I file di configurazione devono essere posizionati all'interno della cartella `config/` del progetto. Ogni file di configurazione è specifico per un livello
### Nome
Il file di configurazione dei livelli deve essere nella seguente forma:
`level_x.json` 
dove `x` è il numero del livello
### Contenuto
La struttura del file di configurazione è la seguente:

```json
{
	"_comment": [
		"Level 5 — normalizeIpRepresentation added.",
		"Decimal/octal/hex alternate representations are converted to dotted-quad",
		"before the blacklist check, closing those bypasses.",
		"IPv4-mapped IPv6 is not yet handled, so it bypasses the blacklist.",
		"Bypasses:",
		"  - IPv4-mapped IPv6: http://[::ffff:127.0.0.1]/",
		"  - Also works:       http://[::ffff:7f00:1]/",
		"    (both notations for the same address)"
	],
	"pipeline": [
		"checkProtocol",
		"decodeAuthority",
		"normalizeIpRepresentation",
		"checkHostBlacklist"
	],
	"allowedProtocols": ["http", "https"],
	"hostBlacklist": ["127.0.0.1", "localhost", "0.0.0.0", "::1"],
	"hostWhitelist": [],
	"portBlacklist": [],
 	"portWhitelist": [],
 	"fileWhitelist": ["/flags/level_5"],
	"randomPort": false
}
```

- **comment**: descrizione del livello e risoluzione
- **pipeline**: specifica l'ordine in cui vengono eseguite le difese. I nomi delle difese specificate qui devono essere gli stessi delle funzioni in `defenses/defenses.js`.
- **allowedProtocols**: lista di protocolli supportati, ad esempio http, https, file...
- **hostBlacklist**: lista degli IP bloccati.
- **fileWhitelist**: lista dei file che l'attaccante può leggere.
- **randomPort**: serve a decidere se il server interno deve essere eseguito sulla porta 80 (standard) o usare una porta random:
	- *true*: porta generata randomicamente (tra 5000 e 25000) per semplificare la risoluzione dei livelli che richiedono port scanning
	- *false*: usa la porta standard 80
# File delle flag
### Percorso
I file di configurazione devono essere posizionati all'interno della cartella `assets/` del progetto.
### Nome
Il file di configurazione dei livelli deve essere nella seguente forma:
`level_x`
dove `x` è il numero del livello
### Contenuto
La struttura del file delle flag è il seguente:

```json
	flag{flag_content}
```
Questo file è un semplicissimo file di testo (senza estensione) che contiene la flag del livello. Io ho scelto questo formato per la flag, ma in realtà si può scrivere qualunque cosa.