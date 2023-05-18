import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
const neo4j = require('neo4j-driver')
const util = require('util')
const driver = neo4j.driver("bolt://localhost:7687", neo4j.auth.basic("", ""), { encrypted: 'ENCRYPTION_OFF' })
const session = driver.session()

async () => {
  await session.run("CREATE INDEX ON :Person(did)", {})
  await session.run("CREATE INDEX ON :Post(uri)", {})
}

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    if (ops.posts.deletes.length > 0) {
      for (const post of ops.posts.deletes) {
        process.stdout.write('P')
        //process.stdout.write(util.inspect(post, false, null, true))
        try {
          await session.run("MATCH (p:Post {uri: $uri}) DETACH DELETE p", { uri: post.uri })
        } catch (err) {
          console.error('[ERROR POST DELETE]:', err)
        }
      }
    }

    if (ops.posts.creates.length > 0) {
      for (const post of ops.posts.creates) {
        process.stdout.write('p')
        //process.stdout.write(util.inspect(post, false, null, true))
        try {

          let createdAt = post.record.createdAt
          let createdAtTrimmed = createdAt.substring(0, createdAt.length - 5)
          await session.run("CREATE (post:Post {uri: $uri, cid: $cid, author: $author, text: $text, createdAt: localDateTime($createdAt)}) MERGE (person:Person {did: $author}) MERGE (person)-[:AUTHOR_OF]->(post)", { uri: post.uri, cid: post.cid, author: post.author, text: post.record.text, createdAt: createdAtTrimmed })

          const replyRoot = post.record?.reply?.root ? post.record.reply.root.uri : null
          const replyParent = post.record?.reply?.parent ? post.record.reply.parent.uri : null
          if (replyRoot) {
            await session.run("MERGE (post1:Post {uri: $uri}) MERGE (post2:Post {uri: $rootUri}) MERGE (post1)-[:ROOT]->(post2)", { uri: post.uri, rootUri: replyRoot })
          }
          if (replyParent) {
            await session.run("MERGE (post1:Post {uri: $uri}) MERGE (post2:Post {uri: $parentUri}) MERGE (post1)-[:PARENT]->(post2)", { uri: post.uri, parentUri: replyParent })
          }
        } catch (err) {
          console.error('[ERROR POST CREATE]:', err)
        }
      }
    }

    if (ops.follows.deletes.length > 0) {
      for (const follow of ops.follows.deletes) {
        process.stdout.write('F')
        //FIXME the record only contains a URI without a source -> dest DID mapping. There is a URI in the at:// uri, but no destination is specificed
        // So not sure yet how to delete the follow relationship in a graph 
        //{
        //  uri: 'at://did:plc:oftvwqwimefeuzes4nwinubh/app.bsky.graph.follow/3jvcsau7em22q'
        //}
        //process.stdout.write(util.inspect(follow, false, null, true))
      }
    }

    if (ops.follows.creates.length > 0) {
      for (const follow of ops.follows.creates) {
        process.stdout.write('f')
        //process.stdout.write(util.inspect(follow, false, null, true))
        try {
          await session.run(" MERGE (p1:Person {did: $authorDid}) MERGE (p2:Person {did: $subjectDid}) MERGE (p1)-[:FOLLOW]->(p2)", { authorDid: follow.author, subjectDid: follow.record.subject })
        } catch (err) {
          console.error('[ERROR POST FOLLOW]:', err)
        }
      }
    }

    if (ops.likes.deletes.length > 0) {
      for (const like of ops.likes.deletes) {
        process.stdout.write('L')
        //FIXME sane situation as with follows.delete, just a URI and not a full source -> dest mapping
        //process.stdout.write(util.inspect(like, false, null, true))
      }
    }

    if (ops.likes.creates.length > 0) {
      for (const like of ops.likes.creates) {
        process.stdout.write('l')
        //process.stdout.write(util.inspect(like, false, null, true))
        try {
          await session.run("MERGE (person:Person {did: $authorDid}) MERGE (post:Post {uri: $postUri}) MERGE (person)-[:LIKE]->(post)", { authorDid: like.author, postUri: like.record.subject.uri })
        } catch (err) {
          console.error('[ERROR POST LIKE]:', err)
        }

      }
    }

    if (ops.reposts.deletes.length > 0) {
      for (const repost of ops.reposts.deletes) {
        process.stdout.write('R')
        //process.stdout.write(util.inspect(repost, false, null, true))
        try {
          await session.run("MATCH (p:Post {uri: $uri}) DETACH DELETE p", { uri: repost.uri })
        } catch (err) {
          console.error('[ERROR REPOST DELETE]:', err)
        }
      }
    }

    if (ops.reposts.creates.length > 0) {
      for (const repost of ops.reposts.creates) {
        process.stdout.write('r')
        //process.stdout.write(util.inspect(repost, false, null, true))
        try {
          await session.run("CREATE (p:Post {uri: $uri, cid: $cid, author: $author, repostUri: $repostUri, createdAt: $createdAt}) RETURN p", { uri: repost.uri, cid: repost.cid, author: repost.author, repostUri: repost.record.subject.uri, createdAt: repost.record.createdAt })
        } catch (err) {
          console.error('[ERROR REPOST CREATE]:', err)
        }
      }
    }
  }
}
