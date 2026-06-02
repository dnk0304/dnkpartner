/** Quick inspector: parse one file and print all fields + body head. */
import * as path from 'path';
import { parseArticleFile } from './parser';

const file = process.argv[2];
if (!file) {
  console.error('usage: tsx inspect.ts <path-or-slug>');
  process.exit(1);
}

const dir = String.raw`C:\Users\D\.claude\agent-memory\marketing\PROJECTS\dnksubastas\content-seo\articles`;
const resolved = file.endsWith('.md') ? file : path.join(dir, file + '.md');
const r = parseArticleFile(resolved);
if (!r.ok || !r.article) {
  console.log('FAIL:', r.error, r.warnings);
  process.exit(2);
}
const a = r.article;
console.log(JSON.stringify({
  slug: a.slug,
  title: a.title,
  seoTitle: a.seoTitle,
  metaDescription: a.metaDescription,
  primaryKeyword: a.primaryKeyword,
  secondaryKeywords: a.secondaryKeywords,
  cluster: a.cluster,
  canonicalUrl: a.canonicalUrl,
  headerStyle: a.headerStyle,
  bodyLength: a.bodyMarkdown.length,
  bodyHead: a.bodyMarkdown.slice(0, 400),
  bodyTail: a.bodyMarkdown.slice(-200),
}, null, 2));
