# Nuxt SJ Fast bra

## Installation
We use NVM to make sure everyone uses the same node version  
Make sure you have NVM and Homebrew installed on your computer

#### Setup http

```sh
// Install mkcert for creating a valid certificate (Mac OS):
$ brew install mkcert
$ mkcert -install
```

#### First time staring the project
Run in this directory:
```sh
$ mkcert localhost
```
This will create two files, `localhost.pem` and `localhost-key.pem`

```sh
$ nvm install
$ nvm use
$ npm install
```
(Make sure you always run `nvm use` before any npm install)

### Each start
Run in this directory:
```sh
$ nvm use
$ npm run dev
```
