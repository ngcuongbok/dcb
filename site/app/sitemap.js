import {posts,base} from '../lib/data';
export const dynamic='force-dynamic';
export default async function sitemap(){const all=await posts();return [{url:base},{url:base+'/blog'},...all.map(p=>({url:base+'/blog/'+p.slug,lastModified:new Date(p.updated_at)}))];}
