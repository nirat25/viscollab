sed -i '' -e '/import { getServerSession } from "next-auth\/next";/d' \
    -e '/import { authOptions } from "..\/..\/auth\/\[...nextauth\]\/options";/d' \
    -e 's/let session = await getServerSession(authOptions);//g' \
    -e 's/if (!session?.user) {/if (false) {/g' \
    web/src/app/api/collab/documents/route.ts

sed -i '' -e '/import { getServerSession } from "next-auth\/next";/d' \
    -e '/import { authOptions } from "..\/..\/auth\/\[...nextauth\]\/options";/d' \
    -e 's/let session = await getServerSession(authOptions);//g' \
    -e 's/if (!session?.user || (session.user as any).role !== "owner") {/if (false) {/g' \
    web/src/app/api/collab/reset/route.ts

sed -i '' -e '/import { getServerSession } from "next-auth\/next";/d' \
    -e '/import { authOptions } from "..\/auth\/\[...nextauth\]\/options";/d' \
    -e 's/let session = await getServerSession(authOptions);//g' \
    -e 's/if (!session && process.env.PLAYWRIGHT_TEST === "true") {/if (process.env.PLAYWRIGHT_TEST === "true") {/g' \
    -e '/if (!session || !session.user) {/,+2d' \
    web/src/app/api/collab/route.ts
