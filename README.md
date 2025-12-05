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

## Backend Cache System

This project uses Nitro's storage layer for server-side caching of API responses.  
Nitro uses Unstorage [See full documentation](https://unstorage.unjs.io)

### How it Works

- **Local Development**: Uses filesystem storage (`.cache` directory)
- **Stage/Production**: Uses Cloudflare KV for persistent, shared caching. There are also drivers available for other hosting solution

### Basic functionality

```ts
const cacheKey = 'test'
const storage = useStorage('cache');

// * * * * Write
// Data can be string, json or even binaries.
// json is auto encoded/decoded
const data = {
  lorem: 'ipsum'
}
// Ttl is measured in seconds
await storage.setItem(cacheKey, data, { ttl: cacheTime });

// * * * *  Read
const cached = await storage.getItem(cacheKey);
// With type
const cached2 = await storage.getItem<{ lorem: string }>(cacheKey);

// * * * *  Remove
await storage.remove(cacheKey);
```

### Helper function

```ts
export default defineEventHandler(async(event) => {
  return useCache(
    'my-unique-key',           // Cache key
    async() => {
      // Your expensive operation *
      return await $fetch('https://api.example.com/data');
    },
    {
      ttl: 3600,                // Time to live in seconds (1 hour)
      prefix: 'my-api'          // Optional prefix, in this example the full key would be 'my-api:my-unique-key'
    }
  );
});
```

\* The "expensive operation" doesn't need to be a single line function, it can be multiple lines of code  
It can for example contain a `Promise.all` to speed up if the result is not in cache.  
See `server/api/geposit/atlas-postcode.get.ts` for example usage


### Testing Cache Locally

```bash
# Test basic caching (1 second delay on first call, instant on second)
curl "https://localhost:3000/api/cache/test?key=test1"

# View all cached items (development only)
curl "https://localhost:3000/api/cache/info"

# Clear cache by prefix (development only)
curl -X POST "https://localhost:3000/api/cache/clear?prefix=geposit"

# Check cache files on disk
ls -la .cache/
```

### Utility Functions

Available in any server route:

- `useCache(key, fetcher, options)` - Get/set cached data
- `invalidateCache(key, prefix)` - Remove specific cache entry
- `clearCachePrefix(prefix)` - Clear all cache entries with prefix

See `server/utils/cache.ts` for implementation details.
