# Codice
Il codice è composto dai seguenti componenti:
- **server.js**: il server principale, si occupa del routing delle richieste del laboratorio SSRF.
- **internal.js**: server interno, si occupa della gestione delle richieste inoltrate a `localhost`
- **utils/**: questa cartella contiene tutti i moduli Javascript custom
	- **config_utils.js**: contiene il codice per la lettura dei file di configurazione
	- **url_utils.js**: contiene il codice per l'interpretazione degli URL
	- **miscellaneous.js**: contiene codice vario
- **levels/**: questa cartella contiene il codice necessario per eseguire il backend dei livelli e i file di configurazione
	- **handler.js**: si occupa dell'interpretazione dei file di configurazione per far funzionare il livello scelto
	- **config/**: contiene i file di configurazione dei livelli
- **view/**: contiene il codice per l'interfaccia grafica
	- **home.html**: codice html per la pagina di selezione del livello
	- **level.hbs**: template handlebars per l'interfaccia del livello
	- **style.css**: file di stile per l'interfaccia
# File di configurazione
### Percorso
I file di configurazione devono essere posizionati all'interno della cartella `levels/config/` del progetto SSRF.
### Nome
Il file di configurazione dei livelli deve essere nella seguente forma:
`level_x.json` 
dove `x` è il numero del livello
### Contenuto
La struttura del file di configurazione è la seguente:
```json
{
    "protocol": [],
    "hostWhitelist": [],
    "hostBlacklist": [],
    "portWhitelist": [],
    "portBlacklist": [],
    "fileWhitelist": [],
    "fileBlacklist": [],
    "doubleEncoding": bool
}
```
- **protocol**: lista di protocolli supportati, ad esempio http, https, file, gopher...
- **doubleEncoding**: valore booleano (true, false). Serve se il livello è vulnerabile a double URL encoding:
	  - true: il livello è vulnerabile
	  - false: il livello non è vulnerabile
# File delle flag
### Percorso
I file di configurazione devono essere posizionati all'interno della cartella `assets/` del progetto SSRF.
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