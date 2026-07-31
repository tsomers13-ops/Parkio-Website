import { describe, expect, it } from "vitest";

import {
  GUIDE_POSTS,
  categoryLabel,
  getGuidePost,
  listGuidePosts,
  listGuideSlugs,
} from "@/lib/guide";

describe("getGuidePost", () => {
  it("finds a post by slug", () => {
    const slug = GUIDE_POSTS[0]!.slug;
    expect(getGuidePost(slug)?.slug).toBe(slug);
  });

  it("returns undefined for an unknown slug", () => {
    expect(getGuidePost("no-such-post")).toBeUndefined();
  });
});

describe("listGuidePosts", () => {
  it("sorts newest first, then by slug for stability", () => {
    const posts = listGuidePosts();
    for (let i = 1; i < posts.length; i++) {
      const prev = posts[i - 1]!;
      const curr = posts[i]!;
      if (prev.publishedAt === curr.publishedAt) {
        expect(prev.slug < curr.slug).toBe(true);
      } else {
        expect(prev.publishedAt > curr.publishedAt).toBe(true);
      }
    }
  });

  it("does not mutate the source array", () => {
    const before = GUIDE_POSTS.map((p) => p.slug);
    listGuidePosts();
    expect(GUIDE_POSTS.map((p) => p.slug)).toEqual(before);
  });
});

describe("listGuideSlugs", () => {
  it("returns one unique slug per post", () => {
    const slugs = listGuideSlugs();
    expect(slugs).toHaveLength(GUIDE_POSTS.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("categoryLabel", () => {
  it("labels every category", () => {
    expect(categoryLabel("live")).toBe("Right now");
    expect(categoryLabel("strategy")).toBe("Strategy");
    expect(categoryLabel("parent")).toBe("For parents");
  });
});

describe("post content contract", () => {
  it("gives every post a Do This Now block with an internal primary CTA", () => {
    for (const post of GUIDE_POSTS) {
      expect(post.doThisNow.steps.length, post.slug).toBeGreaterThan(0);
      expect(post.doThisNow.primaryCta.href.startsWith("/"), post.slug).toBe(
        true,
      );
      expect(post.doThisNow.primaryCta.label.length, post.slug).toBeGreaterThan(
        0,
      );
    }
  });

  it("gives every post body blocks and a positive read time", () => {
    for (const post of GUIDE_POSTS) {
      expect(post.blocks.length, post.slug).toBeGreaterThan(0);
      expect(post.readMinutes, post.slug).toBeGreaterThan(0);
    }
  });

  it("uses internal hrefs for related links", () => {
    for (const post of GUIDE_POSTS) {
      for (const cta of post.related ?? []) {
        expect(cta.href.startsWith("/"), `${post.slug}: ${cta.href}`).toBe(
          true,
        );
      }
    }
  });

  it("uses ISO publish dates", () => {
    for (const post of GUIDE_POSTS) {
      expect(post.publishedAt, post.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
