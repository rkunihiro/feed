import fs from "fs/promises";
import path from "path";

// 設定定数
const MAX_FEED_ITEMS = 50; // RSSフィードに保持する最大アイテム数
const RSS_FILE_PATH = "./docs/github-stars-release.xml";

async function main() {
    const token = process.env.GITHUB_TOKEN;
    const username = process.env.GITHUB_USERNAME || process.env.GITHUB_REPOSITORY_OWNER;
    const repositoryPath = process.env.GITHUB_REPOSITORY || ""; // 例: "owner/repo"
    const feedRepoName = repositoryPath.split("/")[1] || "rss";

    if (!token) {
        console.error("エラー: GITHUB_TOKEN 環境変数が設定されていません。");
        process.exit(1);
    }

    if (!username) {
        console.error("エラー: GITHUB_USERNAME または GITHUB_REPOSITORY_OWNER 環境変数が設定されていません。");
        process.exit(1);
    }

    console.log(`ユーザー: ${username}`);
    console.log(`フィード公開用リポジトリ: ${feedRepoName}`);

    // 1. スター付きリポジトリの最新リリースを収集
    let allReleases = [];
    try {
        allReleases = await getAllStarredReleases(username, token);
        console.log(`合計 ${allReleases.length} 件のリリース情報を取得しました。`);
    } catch (err) {
        console.error("GitHub API からのリリース情報取得に失敗しました:", err);
        process.exit(1);
    }

    if (allReleases.length === 0) {
        console.log("スター付きリポジトリにリリース情報が見つかりませんでした。空のフィードを作成します。");
        const xml = generateRssXml([], username, feedRepoName);
        await fs.mkdir(path.dirname(RSS_FILE_PATH), { recursive: true });
        await fs.writeFile(RSS_FILE_PATH, xml, "utf-8");
        return;
    }

    // 2. 公開日時の降順（新しい順）にソートして、最新の50件に絞り込む
    allReleases.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    const latestReleases = allReleases.slice(0, MAX_FEED_ITEMS);

    console.log(`フィードに含める最新リリース: ${latestReleases.length} 件`);

    // 3. フィードアイテムの作成
    const items = latestReleases.map(release => {
        return {
            title: formatTitle(release.repoName, release.name, release.tagName),
            link: release.url,
            description: formatDescription(release.description),
            pubDate: new Date(release.publishedAt).toUTCString(),
        };
    });

    // 4. RSSフィードのXML生成と保存
    const xml = generateRssXml(items, username, feedRepoName);
    await fs.mkdir(path.dirname(RSS_FILE_PATH), { recursive: true });
    await fs.writeFile(RSS_FILE_PATH, xml, "utf-8");
    console.log(`github-stars-release.xml を更新しました。`);
}

/**
 * スター付きリポジトリとその最新リリースを取得（GraphQL）
 */
async function getAllStarredReleases(username, token) {
    const query = `
    query ($username: String!, $cursor: String) {
      user(login: $username) {
        starredRepositories(first: 100, after: $cursor, orderBy: {field: STARRED_AT, direction: DESC}) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            nameWithOwner
            releases(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) {
              nodes {
                name
                tagName
                publishedAt
                description
                url
              }
            }
          }
        }
      }
    }
  `;

    let cursor = null;
    let hasNextPage = true;
    const releases = [];
    let pageCount = 0;
    const maxPages = 15; // 最大1500件のスター付きリポジトリを処理

    while (hasNextPage && pageCount < maxPages) {
        console.log(`スター付きリポジトリを取得中 (ページ ${pageCount + 1})...`);
        const data = await fetchGraphQL(query, { username, cursor }, token);
        const starred = data.user?.starredRepositories;

        if (!starred) {
            console.warn(`警告: ユーザー "${username}" が見つからないか、スター情報にアクセスできません。`);
            break;
        }

        for (const repo of starred.nodes) {
            const latestRelease = repo.releases?.nodes?.[0];
            if (latestRelease) {
                releases.push({
                    repoName: repo.nameWithOwner,
                    ...latestRelease,
                });
            }
        }

        hasNextPage = starred.pageInfo.hasNextPage;
        cursor = starred.pageInfo.endCursor;
        pageCount++;
    }

    return releases;
}

/**
 * GitHub GraphQL API 呼び出し用の共通関数
 */
async function fetchGraphQL(query, variables, token) {
    const res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "User-Agent": "github-starred-releases-rss",
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GitHub API request failed: ${res.status} ${res.statusText}\n${text}`);
    }

    const json = await res.json();
    if (json.errors) {
        throw new Error(`GitHub GraphQL errors:\n${JSON.stringify(json.errors, null, 2)}`);
    }

    return json.data;
}

/**
 * フィードのタイトルをフォーマットする
 * 仕様: リポジトリ名・リリースタイトル(バージョン番号)
 */
function formatTitle(repoName, name, tagName) {
    const cleanTagName = tagName ? tagName.trim() : "";
    const cleanName = name ? name.trim() : "";

    let titlePart = cleanTagName;
    if (cleanName && cleanName !== cleanTagName) {
        titlePart = `${cleanName} (${cleanTagName})`;
    }

    return `[${repoName}] ${titlePart}`;
}

/**
 * フィードの本文をフォーマットする
 * 仕様: リリースの本文（長い場合は先頭のみ）
 */
function formatDescription(description) {
    if (!description) return "No release notes provided.";

    let desc = description.trim();
    const maxLen = 1000;

    if (desc.length > maxLen) {
        desc = desc.slice(0, maxLen) + "\n\n... (truncated)";
    }

    // CDATAブロックの終了タグ ]]> をエスケープする
    return desc.replace(/]]>/g, "]]&gt;");
}

/**
 * RSSフィードのXMLを組み立てる
 */
function generateRssXml(items, username, repoName) {
    const lastBuildDate = new Date().toUTCString();
    const feedUrl = `https://github.rkunihiro.dev/feed/github-stars-release.xml`;
    const siteUrl = `https://github.rkunihiro.dev/`;

    let xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2000/atom">
<channel>
  <title>GitHub Starred Repositories Releases</title>
  <link>${siteUrl}</link>
  <description>Recent releases from repositories starred by ${username}</description>
  <language>ja</language>
  <lastBuildDate>${lastBuildDate}</lastBuildDate>
  <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
`;

    for (const item of items) {
        xml += `  <item>
    <title>${escapeXml(item.title)}</title>
    <link>${escapeXml(item.link)}</link>
    <guid isPermaLink="true">${escapeXml(item.link)}</guid>
    <description><![CDATA[${item.description}]]></description>
    <pubDate>${item.pubDate}</pubDate>
  </item>
`;
    }

    xml += `</channel>
</rss>`;

    return xml;
}

/**
 * XMLの属性やテキストノード向けに特殊文字をエスケープする
 */
function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case "&":
                return "&amp;";
            case "'":
                return "&apos;";
            case "\"":
                return "&quot;";
            default:
                return c;
        }
    });
}

main().catch(err => {
    console.error("未処理のエラーが発生しました:", err);
    process.exit(1);
});
