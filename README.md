# listoor

A bot to maintain listings on OpenSea.

Requirements:

-   Node.js v20 or higher
-   Yarn

## Run

    yarn
    yarn build
    yarn start

## Troubleshoot

### Maximum active listings

```
Server Error: Validation error: You have reached the maximum limit of 50000 active listings. Please cancel some existing listings before creating new ones.
```

This issue should not occur under normal circumstances but if it ever happens,
the only way to cancel active listings in bulk is to call `incrementCounter()`
on the Seaport contract (`0x0000000000000068f116a894984e2db1123eb395`).
This will invalidate all listings on that chain.
