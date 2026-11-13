# tabora.app

The website of [Tabora](https://github.com/Tabora-App/browser), an ad-free browser with mail and a
wallet built in: one page in four languages at [tabora.app](https://tabora.app).

The site is static. It is built from page templates and translation dictionaries, and the built
result is committed, so what is deployed is exactly what is in this repository.

## Layout

| Path | Contents |
|---|---|
| `pages/index.html` | The template of the landing page. Its text is Russian, the source language: each phrase is a key of the dictionaries |
| `pages/privacy.html` | The template of the privacy policy (`/<lang>/privacy/`, and `/privacy/` in English): what the apps and the servers know about a person, where it is kept and how to delete it. Keep it in step with what the code really does |
| `pages/terms.html` | The template of the terms of use (`/<lang>/terms/`, and `/terms/` in English): the rules of the account and the mail, what the wallet and the agent do not promise, how an account is closed. |
| `i18n/<lang>.json` | Translations: English, Ukrainian, Spanish |
| `src/` | Scripts: the three.js scene of the first screen and small interactions |
| `public/` | The built site, deployed as is: `/ru/`, `/en/`, `/uk/`, `/es/` and `/` (chosen by the browser language) |
| `pages.mjs` | Page builder: translates the templates (the list is `PAGES` at its top), checks that every phrase is translated, that the markup is the same in all languages and that local links resolve. A link to another page of the site is written with the source language (`/ru/privacy/`) and follows the language of the page |
| `build.sh`, `verify.sh`, `deploy.sh` | Build, reproducibility check, deployment |

## Build

```sh
./build.sh     # scripts and pages into public/
./verify.sh    # rebuilds in a clean directory and compares byte for byte with public/
```

Requires Node.js. Package versions are pinned in `package-lock.json`; package install scripts are
not run. Scripts get hashed file names, so the web server can serve `/assets/` as immutable.

To change the text of the site, edit `pages/index.html`, add the translations of new phrases to
`i18n/*.json` and run `./build.sh`. The build stops if a phrase has no translation.

## Deploy

```sh
./deploy.sh    # verifies, then copies public/ to the host
```

The host itself (nginx, TLS, DNS) is set up from the
[server repository](https://github.com/Tabora-App/server).

## License

[Mozilla Public License 2.0](LICENSE).
