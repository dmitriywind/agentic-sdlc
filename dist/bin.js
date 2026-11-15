#!/usr/bin/env node
import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd2 = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd2 === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      const ctrl = callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd2 = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd2 === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      const ctrl = await callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node, path);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
      return void 0;
    }
    function replaceNode(key, path, node) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle2, prefix] = parts;
            this.tags[handle2] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version3] = parts;
            if (version3 === "1.1" || version3 === "1.2") {
              this.yaml.version = version3;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version3);
              onError(6, `Unsupported YAML version ${version3}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle2, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle2];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle2 === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle2, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle2 + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle2, prefix] of tagEntries) {
          if (handle2 === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle2} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        if (found && ctx) {
          const { anchors: anchors2, doc: doc2, maxAliasCount } = ctx;
          let data = anchors2.get(found);
          if (!data) {
            toJS.toJS(found, null, ctx);
            data = anchors2.get(found);
          }
          if (data?.res === void 0) {
            const msg = "This should not happen: Alias anchor was not resolved?";
            throw new ReferenceError(msg);
          }
          if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
              data.aliasCount = getAliasCount(doc2, found, anchors2);
            if (data.count * data.aliasCount > maxAliasCount) {
              const msg = "Excessive alias count indicates a resource exhaustion attack";
              throw new ReferenceError(msg);
            }
          }
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const source = this.resolve(ctx.doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        return ctx.anchors.get(source).res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema: schema2, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema2.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema2[identity.MAP] : Symbol.iterator in Object(value) ? schema2[identity.SEQ] : schema2[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema2, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema: schema2,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema2) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema2,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema2) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema2)
          copy.schema = schema2;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema2) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema2) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema2);
        if (identity.isNode(value))
          value = value.clone(schema2);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema2) {
        super(identity.MAP, schema2);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema2, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema2);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema2.sortMapEntries === "function") {
          map.items.sort(schema2.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema2, obj, ctx) => YAMLMap.YAMLMap.from(schema2, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema2) {
        super(identity.SEQ, schema2);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema2, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema2);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema2, obj, ctx) => YAMLSeq.YAMLSeq.from(schema2, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema2 = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema2;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema2 = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema2;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema2, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema2);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema2, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema2, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema2, iterable, ctx) => YAMLOMap.from(schema2, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema2) {
        super(schema2);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema2, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema2);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema2, iterable, ctx) => YAMLSet.from(schema2, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema2 = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema2;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema2 = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema2.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema: schema2, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema2 === "string" && schema2 || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version: version3 } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version3 = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version: version3 });
        this.setSchema(version3, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version3, options = {}) {
        if (typeof version3 === "number")
          version3 = String(version3);
        let opt;
        switch (version3) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version3;
            else
              this.directives = new directives.Directives({ version: version3 });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version3);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return unfoldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function unfoldLines(source) {
      const line = /(.*?)\r?\n/sy;
      let match = line.exec(source);
      if (!match)
        return source;
      let trimEnd, trimBoth;
      try {
        trimEnd = new RegExp("(?<![ 	])[ 	]+$");
        trimBoth = new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
      } catch {
        trimEnd = /[ \t]+$/;
        trimBoth = /^[ \t]+|[ \t]+$/g;
      }
      let res = match[1].replace(trimEnd, "");
      let sep = " ";
      let pos = line.lastIndex;
      while (match = line.exec(source)) {
        const lm = match[1].replace(trimBoth, "");
        if (lm === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + lm;
          sep = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema2, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema2[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema2.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema2.knownTags[tagName];
      if (kt && !kt.collection) {
        schema2.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema2[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema: schema2 }, value, token, onError) {
      const tag = schema2.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema2[identity.SCALAR];
      if (schema2.compat) {
        const compat = schema2.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema2[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote2 = this.charAt(0);
        let end = this.buffer.indexOf(quote2, this.pos + 1);
        if (quote2 === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar.end) {
            sep = scalar.end;
            sep.push(this.sourceToken);
            delete scalar.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument2(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse6(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument2(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse6;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument2;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/binding.ts
import { readFileSync } from "fs";
import { join } from "path";
function loadBinding(root) {
  let text;
  try {
    text = readFileSync(join(root, BINDING_PATH), "utf8");
  } catch {
    throw new Error(`no ${BINDING_PATH} in ${root}; run: agentic-sdlc init`);
  }
  return (0, import_yaml.parse)(text);
}
function validateBinding(b) {
  const p = [];
  const x = b;
  if (!x || typeof x !== "object") return ["binding is empty"];
  if (x.version !== 2) p.push("version must be 2");
  if (!PROFILES.includes(x.profile)) p.push(`profile '${x.profile}' must be one of ${PROFILES.join("|")}`);
  const who = (w) => typeof w === "string" && !!w || !!w && typeof w === "object" && typeof w.board === "string" && !!w.board && typeof w.forge === "string" && !!w.forge;
  const role = (k) => {
    const v = x.owners?.[k], l = Array.isArray(v) ? v : [v];
    if (Array.isArray(v) && !v.length) p.push(`owners.${k} must not be an empty list`);
    else if (!l.every(who)) p.push(`owners.${k} must be a name or { board, forge }, or a list of them`);
  };
  if (x.owners?.factory === void 0) p.push("owners.factory must name the factory owner (a name, or { board, forge }, or a list of them)");
  else role("factory");
  for (const k of ["product", "operator", "security", "compliance"]) if (x.owners?.[k] !== void 0) role(k);
  const ids = (v) => (Array.isArray(v) ? v : v === void 0 ? [] : [v]).flatMap((e) => typeof e === "object" && e ? [e.board, e.forge] : [e]).filter(Boolean).map((s) => String(s).toLowerCase());
  const rev = String(x.forge?.review_identity ?? "").toLowerCase();
  if (rev && ["product", "factory", "operator", "security", "compliance"].some((k) => ids(x.owners?.[k]).includes(rev))) p.push("forge.review_identity must not be an owner: the review identity is a bot separate from every owner");
  if (Array.isArray(x.owners?.bots) && !x.owners.bots.every(who)) p.push("owners.bots entries must be names, or { board, forge }");
  if (!Array.isArray(x.paths?.factory) || !x.paths.factory.length || x.paths.factory.some((g) => typeof g !== "string")) p.push("paths.factory must list the factory path globs");
  if (!Array.isArray(x.owners?.bots) || !x.owners.bots.length) p.push("owners.bots must list the accounts the factory runs as");
  for (const k of REQUIRED) if (x[k] === void 0 || x[k] === null) p.push(`missing key: ${k}`);
  for (const port of ["board", "forge", "vcs"]) {
    const a = x[port]?.adapter;
    if (x[port] && !ADAPTERS[port].includes(a)) p.push(`${port}.adapter '${a}' is not one of ${ADAPTERS[port].join("|")}`);
    const spec = OPTIONS[port][a];
    if (!spec) continue;
    const opts = x[port].options ?? {};
    for (const k of spec[0]) if (opts[k] === void 0 || opts[k] === null || opts[k] === "") p.push(`${port}.options.${k} is required for adapter ${a}`);
    for (const k of Object.keys(opts)) if (!spec[0].includes(k) && !spec[1].includes(k)) p.push(`${port}.options.${k} is not read by adapter ${a} (known: ${[...spec[0], ...spec[1]].join(", ") || "none"})`);
  }
  if (x.board) {
    if (!Array.isArray(x.board.statuses)) p.push("board.statuses must be a list");
    else for (const s of STATUSES) if (!x.board.statuses.includes(s)) p.push(`board.statuses lacks '${s}'`);
  }
  if (Array.isArray(x.sizes)) {
    for (const k of ["ready_size_limit", "fast_lane_max_size"]) if (x[k] && !x.sizes.includes(x[k])) p.push(`${k} '${x[k]}' is not in sizes`);
  }
  for (const t of ["fast", "balanced", "deep"]) if (x.models && !x.models[t]) p.push(`models.${t} missing`);
  if (x.vcs && !String(x.vcs.change_pattern ?? "").includes("<ticket>")) p.push("vcs.change_pattern must contain <ticket>");
  if (x.vcs) {
    const lines = (x.product?.delivery ?? "release-line") === "release-line";
    for (const [k, what] of [["trunk", "name the trunk branch"], ...lines ? [["release_prefix", "name the release line prefix"]] : [], ["factory_change_pattern", "be a branch pattern for factory changes"]])
      if (typeof x.vcs[k] !== "string" || !x.vcs[k]) p.push(`vcs.${k} must ${what}`);
    if (typeof x.vcs.tag_prefix !== "string") p.push("vcs.tag_prefix must be a string (empty for none)");
    if (typeof x.vcs.release_prefix === "string" && x.vcs.release_prefix && !x.vcs.release_prefix.endsWith("/")) p.push("vcs.release_prefix must end in '/'");
    if (x.vcs.release_prefix === "") p.push("vcs.release_prefix must not be empty: it would match every branch (leave it out for continuous delivery)");
  }
  const pr = x.product;
  if (pr) {
    if (!Array.isArray(pr.environments) || !pr.environments.length) p.push("product.environments must be a non-empty list");
    if (pr.delivery !== void 0 && !DELIVERY.includes(pr.delivery)) p.push(`product.delivery '${pr.delivery}' is not one of ${DELIVERY.join("|")}`);
    if (pr.delivery === "release-line" && Array.isArray(pr.environments) && pr.environments.length < 2) p.push("product.delivery release-line needs two or more environments; use continuous");
    const ev = (pr.evidence ?? []).filter((k) => !EVIDENCE.includes(k));
    if (ev.length) p.push(`product.evidence has unknown kinds: ${ev.join(", ")} (known: ${EVIDENCE.join(", ")})`);
    if (pr.slo !== void 0) {
      const s = pr.slo;
      if (!s || typeof s !== "object" || typeof s.change_failure_rate_max !== "number" || !(s.change_failure_rate_max >= 0 && s.change_failure_rate_max <= 1)) p.push("product.slo.change_failure_rate_max must be a number from 0 to 1");
      if (!s || typeof s !== "object" || !Number.isInteger(s.window_days) || !(s.window_days > 0)) p.push("product.slo.window_days must be a positive whole number");
    }
    const bad = (pr.proofs ?? []).filter((k) => !PROOFS.includes(k));
    if (bad.length) p.push(`product.proofs has unknown kinds: ${bad.join(", ")}`);
  }
  for (const [k, e] of Object.entries(x.executors ?? {})) {
    if (!EXECUTORS.includes(e?.kind)) p.push(`executors.${k}.kind '${e?.kind}' is not one of ${EXECUTORS.join("|")}`);
    for (const key of EXECUTOR_KEYS[e?.kind] ?? []) if (!e[key]) p.push(`executors.${k}.${key} is required for kind ${e.kind}`);
    if (e?.kind === "managed" && e.api !== void 0 && !MANAGED_APIS.includes(e.api)) p.push(`executors.${k}.api '${e.api}' is not one of ${MANAGED_APIS.join("|")}`);
    for (const m of e?.mcps ?? []) if (!x.mcps?.[m]) p.push(`executors.${k}.mcps '${m}' is not in the binding's mcps`);
    for (const v of e?.secrets ?? []) if (!/^[A-Z_][A-Z0-9_]*$/.test(String(v))) p.push(`executors.${k}.secrets '${v}' is not an env var name`);
    for (const lk of ["max_turns", "max_tokens", "max_minutes"]) if (e?.[lk] !== void 0 && !(Number.isInteger(e[lk]) && e[lk] > 0)) p.push(`executors.${k}.${lk} must be a positive integer`);
    if (e?.sandbox !== void 0 && !SANDBOXES.includes(e.sandbox)) p.push(`executors.${k}.sandbox '${e.sandbox}' is not one of ${SANDBOXES.join("|")}`);
    if (e?.model !== void 0) {
      const { tier, id } = e.model ?? {};
      if (tier === void 0 === (id === void 0)) p.push(`executors.${k}.model needs exactly one of tier or id`);
      else if (tier !== void 0 && !TIERS.includes(tier)) p.push(`executors.${k}.model.tier '${tier}' is not one of ${TIERS.join("|")}`);
    }
  }
  if (x.forge?.provenance !== void 0 && !PROVENANCE.includes(x.forge.provenance)) p.push(`forge.provenance '${x.forge.provenance}' is not one of ${PROVENANCE.join("|")}`);
  if (["human-approval", "ticket-linkage", "proofs-on-base", "agent-provenance"].includes(x.forge?.review_check_name)) p.push(`forge.review_check_name '${x.forge.review_check_name}' is a gate's context`);
  const rid = String(x.forge?.review_identity ?? ""), rt = x.forge?.options?.review_token_env;
  if (rid && !rt) p.push("forge.review_identity is set but forge.options.review_token_env is unset: name its token, or empty review_identity for one identity");
  if (!rid && rt) p.push("forge.options.review_token_env is set but forge.review_identity is empty: name the review identity, or remove review_token_env for one identity");
  if (rt && rt === x.forge?.options?.token_env) p.push("forge.options.review_token_env equals token_env: two identities need two tokens");
  if (x.profile === "organization" && !rid) p.push("profile organization needs a separate review identity: set forge.review_identity and forge.options.review_token_env");
  const sc = x.board?.scope;
  if (sc !== void 0) {
    const label = String(sc?.label ?? ""), pre = label.split(":")[0];
    if (!/^[^:]+:.+/.test(label)) p.push("board.scope.label must be '<prefix>:<name>', e.g. repo:app-a");
    else if (sc.home && !(Array.isArray(sc.repos) && sc.repos.includes(label) && sc.repos.every((r) => String(r).startsWith(`${pre}:`))))
      p.push(`board.scope.repos must list every repo label, this repo's included, each starting '${pre}:'`);
    else if (!sc.home && sc.repos !== void 0) p.push("board.scope.repos is for the home repo only (board.scope.home: true)");
  }
  const ha = x.forge?.human_approval;
  if (ha !== void 0 && !HUMAN_APPROVAL.includes(ha)) p.push(`forge.human_approval '${ha}' is not one of ${HUMAN_APPROVAL.join("|")}`);
  for (const k of ["bench_min_cases", "bench_trials"]) {
    const v = x.learning?.[k];
    if (v !== void 0 && !(Number.isInteger(v) && v > 0)) p.push(`learning.${k} must be a positive integer`);
  }
  if (x.cycle?.land_wait_minutes !== void 0 && !(Number.isInteger(x.cycle.land_wait_minutes) && x.cycle.land_wait_minutes >= 0)) p.push("cycle.land_wait_minutes must be a whole number of minutes");
  if (x.cycle?.max_rework !== void 0 && !(Number.isInteger(x.cycle.max_rework) && x.cycle.max_rework > 0)) p.push("cycle.max_rework must be a positive integer");
  if (x.cycle?.max_tokens_per_ticket !== void 0 && !(Number.isInteger(x.cycle.max_tokens_per_ticket) && x.cycle.max_tokens_per_ticket > 0)) p.push("cycle.max_tokens_per_ticket must be a positive integer");
  const bb = x.learning?.bench_budget;
  if (bb !== void 0) {
    if (!bb || typeof bb !== "object" || Array.isArray(bb)) p.push("learning.bench_budget must be { max_runs, max_minutes }");
    else for (const [k, v] of Object.entries(bb)) {
      if (!["max_runs", "max_minutes"].includes(k)) p.push(`learning.bench_budget.${k} is not a bench cap (max_runs, max_minutes; bench results carry no token count)`);
      else if (!(Number.isInteger(v) && v > 0)) p.push(`learning.bench_budget.${k} must be a positive integer`);
    }
  }
  if (x.learning?.enabled !== void 0 && typeof x.learning.enabled !== "boolean") p.push("learning.enabled must be true or false");
  for (const k of ["preview", "proofs_on_base", "evidence_check"]) if (x.commands?.[k] !== void 0 && typeof x.commands[k] !== "string") p.push(`commands.${k} must be a command line`);
  if (x.traces && !String(x.traces.uri ?? "").includes("{run_id}")) p.push("traces.uri must contain {run_id}");
  if (x.telemetry !== void 0) {
    if (!x.telemetry || typeof x.telemetry !== "object" || Array.isArray(x.telemetry)) p.push("telemetry must be { otlp_endpoint_env, cdevents_sink_env, headers_env }");
    else for (const [k, v] of Object.entries(x.telemetry)) {
      if (!["otlp_endpoint_env", "cdevents_sink_env", "headers_env"].includes(k)) p.push(`telemetry.${k} is not a telemetry key (otlp_endpoint_env, cdevents_sink_env, headers_env)`);
      else if (typeof v !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) p.push(`telemetry.${k} must be the NAME of an env var, never a URL or a value`);
    }
  }
  if (x.executors && !x.executors.default) p.push("executors.default is missing");
  if (x.heartbeat && !String(x.heartbeat.ticket ?? "").trim()) p.push("heartbeat.ticket is empty: create the heartbeat ticket and put its id here");
  const lists = [["board.done_statuses", x.board?.done_statuses], ["board.env_labels", x.board?.env_labels], ["board.signal_streams", x.board?.signal_streams], ["forge.required_checks", x.forge?.required_checks]];
  for (const [k, v] of lists) if (v !== void 0 && !Array.isArray(v)) p.push(`${k} must be a list`);
  for (const k of ["human", "bug", "feature"]) if (x.board?.labels !== void 0 && typeof x.board.labels?.[k] !== "string") p.push(`board.labels.${k} must be a label name`);
  if (x.vcs?.version_scheme !== void 0 && !["calver", "semver"].includes(x.vcs.version_scheme)) p.push(`vcs.version_scheme '${x.vcs.version_scheme}' is not one of calver|semver`);
  if (x.learning?.judge_tier !== void 0 && !TIERS.includes(x.learning.judge_tier)) p.push(`learning.judge_tier '${x.learning.judge_tier}' is not one of ${TIERS.join("|")}`);
  for (const c of x.learning?.auto_merge_classes ?? []) if (c !== "tuning") p.push(`learning.auto_merge_classes '${c}': only tuning may merge without the factory owner`);
  for (const [n, m] of Object.entries(x.mcps ?? {})) if (!m?.url === !m?.command) p.push(`mcps.${n} needs exactly one of url or command`);
  for (const [k, e] of Object.entries(x.executors ?? {})) {
    if (e?.kind !== "managed") continue;
    const api = e.api ?? "generic";
    const need3 = api === "claude" ? ["agent_env", "environment_env"] : api === "cursor" ? ["repo_url"] : api === "generic" ? ["endpoint_env"] : [];
    for (const key of need3) if (!e[key]) p.push(`executors.${k}.${key} is required for a managed executor with api ${api}`);
  }
  return p;
}
function bindingWarnings(b) {
  const w = [];
  const x = b;
  for (const k of Object.keys(x?.owners ?? {})) if (!["product", "factory", "operator", "security", "compliance", "bots"].includes(k)) w.push(`owners.${k} is not a known owner role (product, factory, operator, security, compliance, bots); remove it`);
  if (x?.product?.kind !== void 0) w.push("product.kind is unused; remove it");
  if (x?.board?.milestone !== void 0) w.push("board.milestone is unused; remove it");
  const hb = String(x?.heartbeat?.ticket ?? "");
  if (["github", "github-issues", "local"].includes(x?.board?.adapter) && hb && !/^\d+$/.test(hb)) w.push(`heartbeat.ticket '${hb}' is not an issue number; the ${x.board.adapter} board addresses tickets by number`);
  const envs = x?.product?.environments ?? [];
  for (const l of x?.board?.env_labels ?? []) if (String(l).startsWith("env:") && !envs.includes(String(l).slice(4))) w.push(`board.env_labels '${l}' names no product.environments entry`);
  if ((x?.product?.evidence ?? []).length && !x?.commands?.evidence_check) w.push("product.evidence is set but commands.evidence_check is unset: no release can show its evidence");
  if (x?.forge?.provenance === "require" && !(x.forge.required_checks ?? []).includes("agent-provenance")) w.push("forge.provenance is require but 'agent-provenance' is not in forge.required_checks: the gate can fail without blocking a merge; add it here and to the trunk ruleset");
  if (x?.forge?.review_runtime !== void 0) w.push("forge.review_runtime is unused: review/review runs where forge.review_identity says; remove it");
  const size = x?.learning?.bench_size, min = x?.learning?.bench_min_cases ?? 20;
  if (size !== void 0 && Number(size) < min) w.push(`learning.bench_size ${size} is below bench_min_cases ${min}: bench compare reports regressed for every change`);
  if (x?.learning?.enabled === true && !x.agent_command) w.push("learning.enabled is true but agent_command is unset: bench cannot run");
  if (x?.learning?.budget_usd_per_week !== void 0) w.push("learning.budget_usd_per_week is unused; learning.enabled turns learning on; remove it");
  if (x?.profile === "individual") {
    for (const [k, e] of Object.entries(x.executors ?? {}))
      if (["managed", "webhook", "assign"].includes(e?.kind)) w.push(`executors.${k}: kind ${e.kind} needs an API or hosted agent; profile individual is subscriptions only: use individual-api`);
    const uri = x.traces?.uri;
    if (uri !== void 0 && !["./", ".agents/", "/"].some((q) => String(uri).startsWith(q)) && !/^[A-Za-z]:[\\/]/.test(String(uri))) w.push(`traces.uri '${uri}' is not a local path (./, .agents/ or absolute); individual profile has no org storage`);
  } else if (x?.profile === "organization") {
    const sb = x.executors?.default?.sandbox;
    if (!sb || sb === "local") w.push("executors.default.sandbox is local or unset: organization expects cloud or container");
    if (!x.traces) w.push("traces is unset: organization expects traces.uri on org storage");
    if (!Object.values(x.executors ?? {}).some((e) => e?.kind === "managed")) w.push("no executor is kind managed: organization runs its stages on managed agents");
  }
  return w;
}
function shippedOptions(envs, delivery = "release-line") {
  const inRelease = delivery === "release-line" && envs.length > 1;
  return ["Not shipped", ...envs.slice(0, -1).map((e) => `On ${e}`), ...inRelease ? ["In release"] : [], `On ${envs[envs.length - 1]}`];
}
var import_yaml, BINDING_PATH, ADAPTERS, OPTIONS, REQUIRED, PROOFS, EXECUTORS, EXECUTOR_KEYS, MANAGED_APIS, HUMAN_APPROVAL, SANDBOXES, PROFILES, DELIVERY, PROVENANCE, EVIDENCE, TIERS, STATUSES;
var init_binding = __esm({
  "src/binding.ts"() {
    "use strict";
    import_yaml = __toESM(require_dist(), 1);
    BINDING_PATH = ".agents/binding.yml";
    ADAPTERS = {
      board: ["github", "github-issues", "jira", "linear", "local"],
      forge: ["github"],
      vcs: ["git"]
    };
    OPTIONS = {
      board: {
        github: [["owner", "project_number", "repo"], ["token_env"]],
        "github-issues": [["repo"], []],
        jira: [["base_url", "project_key", "email_env", "token_env"], []],
        linear: [["team_key", "token_env"], []],
        local: [[], []]
      },
      forge: {
        github: [[], ["repo", "token_env", "review_token_env"]]
      },
      vcs: { git: [[], []] }
    };
    REQUIRED = [
      "owners",
      "board",
      "forge",
      "vcs",
      "models",
      "commands",
      "paths",
      "sizes",
      "ready_size_limit",
      "fast_lane_max_size",
      "priorities",
      "p0_setters",
      "max_subissue_depth",
      "spec_marker",
      "stall_minutes",
      "parallel_agents",
      "cycle",
      "heartbeat",
      "learning",
      "product",
      "executors"
    ];
    PROOFS = ["test", "eval", "visual", "data-check", "computer-use", "manual"];
    EXECUTORS = ["harness", "command", "webhook", "managed", "assign"];
    EXECUTOR_KEYS = { command: ["run"], webhook: ["url_env"], managed: ["token_env"], assign: ["user"] };
    MANAGED_APIS = ["claude", "cursor", "antigravity", "generic"];
    HUMAN_APPROVAL = ["full-lane", "always", "never"];
    SANDBOXES = ["cloud", "container", "local"];
    PROFILES = ["individual", "individual-api", "organization"];
    DELIVERY = ["release-line", "continuous"];
    PROVENANCE = ["off", "warn", "require"];
    EVIDENCE = ["sbom", "provenance", "signature"];
    TIERS = ["fast", "balanced", "deep"];
    STATUSES = ["Ideas", "Signals", "Backlog", "Ready", "In progress", "In review", "Done", "Cancelled"];
  }
});

// src/exec.ts
import { execFileSync } from "child_process";
function retryWait(retryAfter, attempt, now = Date.now()) {
  let ms = 1e3 * 2 ** (attempt - 1);
  if (retryAfter) {
    const secs = Number(retryAfter);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(secs)) ms = secs * 1e3;
    else if (!Number.isNaN(at)) ms = at - now;
  }
  return Math.min(MAX_WAIT_MS, Math.max(0, ms));
}
function scrubUrl(message, ...urls) {
  let out = message.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, "<url>");
  for (const u of urls) {
    if (!u) continue;
    const parts = [u];
    try {
      const x = new URL(u);
      parts.push(x.origin, x.username, x.password);
    } catch {
    }
    for (const p of parts.sort((a, b) => b.length - a.length)) if (p.length > 2) out = out.split(p).join("<url>");
  }
  return out;
}
function ghReads(args) {
  if (args[0] === "api") {
    const i = args.findIndex((a) => a === "-X" || a === "--method");
    if (i >= 0) return String(args[i + 1]).toUpperCase() === "GET";
    return !args.some((a) => ["--input", "-f", "-F", "--field", "--raw-field"].includes(a));
  }
  return /^(view|list|field-list|item-list)$/.test(args[1] ?? "");
}
async function ghRetry(exec2, args, opts) {
  const read = ghReads(args);
  for (let attempt = 1; ; attempt++) {
    try {
      return exec2("gh", args, opts);
    } catch (e) {
      const text = failureText(e);
      const limited = /HTTP 429|rate limit|too many requests/i.test(text);
      const server = /HTTP 5\d\d/i.test(text);
      if (!(limited || read && server) || attempt >= TRIES) throw e;
      await sleep(retryWait(retryAfterOf(text), attempt));
    }
  }
}
var exec, sleep, pause, HTTP_TIMEOUT_MS, TRIES, MAX_WAIT_MS, http, failureText, retryAfterOf;
var init_exec = __esm({
  "src/exec.ts"() {
    "use strict";
    exec = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", cwd: opts.cwd, input: opts.input, env: opts.env ?? process.env, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
    sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    pause = (ms) => sleep(ms);
    HTTP_TIMEOUT_MS = 3e4;
    TRIES = 3;
    MAX_WAIT_MS = 3e4;
    http = async (method, url, opts = {}) => {
      const tries = opts.tries ?? TRIES;
      for (let attempt = 1; ; attempt++) {
        let res, text;
        try {
          res = await fetch(url, {
            method,
            headers: { "content-type": "application/json", accept: "application/json", ...opts.headers },
            body: opts.body === void 0 ? void 0 : JSON.stringify(opts.body),
            signal: AbortSignal.timeout(opts.timeoutMs ?? HTTP_TIMEOUT_MS)
          });
          text = await res.text();
        } catch (e) {
          const cause = e.cause?.message;
          throw new Error(scrubUrl(`${method} request failed: ${e.message}${cause ? ` (${cause})` : ""}`, url));
        }
        if (res.ok) {
          try {
            return text ? JSON.parse(text) : {};
          } catch {
            return { raw: text };
          }
        }
        const retry = res.status === 429 || res.status >= 500 && method.toUpperCase() !== "POST";
        if (!retry || attempt >= tries) throw new Error(`${method} ${new URL(url).host} -> ${res.status}: ${text.slice(0, 300)}`);
        await sleep(retryWait(res.headers.get("retry-after"), attempt));
      }
    };
    failureText = (e) => `${e?.message ?? ""}
${String(e?.stderr ?? "")}`;
    retryAfterOf = (text) => /retry[- ]after[:= ]+(\d+)/i.exec(text)?.[1] ?? null;
  }
});

// src/ports.ts
function limitsOf(b, ex) {
  const out = {};
  for (const k of LIMIT_KEYS) {
    const v = ex[k] ?? b.executors?.default?.[k];
    if (v !== void 0) out[k] = v;
  }
  return out;
}
function ownersFor(o, side) {
  const list = (w) => (w === void 0 || w === null ? [] : Array.isArray(w) ? w : [w]).map((x) => typeof x === "object" && x ? x[side] : x).filter((x) => !!x);
  return { product: list(o?.product), factory: list(o?.factory), operator: list(o?.operator), security: list(o?.security), compliance: list(o?.compliance), bots: list(o?.bots) };
}
var MovedError, parseCloses, LIMIT_KEYS, esc, patternRe, isChangeLine;
var init_ports = __esm({
  "src/ports.ts"() {
    "use strict";
    MovedError = class extends Error {
      constructor(id, expected, actual) {
        super(`${id} is at ${actual}, not ${expected}; not moved`);
      }
    };
    parseCloses = (body) => [...new Set([...body.matchAll(/^[ \t]*Closes[ \t]+#?([A-Za-z0-9_-]+)[ \t]*$/gim)].map((m) => m[1]))];
    LIMIT_KEYS = ["max_turns", "max_tokens", "max_minutes"];
    esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    patternRe = (p) => new RegExp("^" + p.split(/(<ticket>|<name>)/).map((x) => x === "<ticket>" ? "[A-Za-z0-9_-]+" : x === "<name>" ? "[a-z0-9]+(?:-[a-z0-9]+)*" : esc(x)).join("") + "$");
    isChangeLine = (b, n) => patternRe(b.vcs.change_pattern).test(n) || patternRe(b.vcs.factory_change_pattern).test(n);
  }
});

// src/forge/util.ts
import { readFileSync as readFileSync2 } from "fs";
function flagError(e) {
  const m = e.message;
  const missing = /^Option '--([\w-]+)[^']*' argument missing/.exec(m);
  if (missing) return `--${missing[1]} needs a value`;
  const extra = /^Option '--([\w-]+)' does not take an argument/.exec(m);
  if (extra) return `--${extra[1]} takes no value`;
  const unknown = /^Unknown option '(--[\w-]+)'/.exec(m);
  return unknown ? `unknown flag ${unknown[1]}` : m.split(". ")[0];
}
function parseStrict(group, verb, argv, spec = {}) {
  const pos = [];
  const flags = {};
  const value = spec.value ?? [], bool = spec.bool ?? [], num = spec.num ?? [];
  const push = (k, v) => {
    if (num.includes(k) && !/^\d+$/.test(v)) throw new UsageError(`--${k} needs a whole number, got '${v}'`);
    (flags[k] ??= []).push(v);
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--") || a.length <= 2) {
      pos.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const k = a.slice(2, eq < 0 ? void 0 : eq);
    if (bool.includes(k)) {
      if (eq >= 0) throw new UsageError(`--${k} takes no value`);
      (flags[k] ??= []).push("true");
    } else if (value.includes(k)) {
      if (eq >= 0) push(k, a.slice(eq + 1));
      else {
        if (i + 1 >= argv.length) throw new UsageError(`--${k} needs a value`);
        push(k, argv[++i]);
      }
    } else throw new UsageError(`unknown flag --${k} for ${group} ${verb}`);
  }
  return {
    pos,
    flags,
    get: (k) => flags[k]?.[0],
    all: (k) => flags[k] ?? [],
    has: (k) => k in flags,
    need: (k) => {
      const v = flags[k]?.[0];
      if (v === void 0) throw new UsageError(`${group} ${verb}: --${k} is required`);
      return v;
    }
  };
}
function bodyFile(a) {
  const path = a.need("body-file");
  try {
    return readFileSync2(path, "utf8");
  } catch (e) {
    throw new UsageError(`--body-file cannot be read: ${path} (${e.code ?? e.message})`);
  }
}
function parseArgs(argv, bool = []) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") && a.length > 2) {
      const eq = a.indexOf("=");
      const k = a.slice(2, eq < 0 ? void 0 : eq);
      if (bool.includes(k)) {
        if (eq >= 0) throw new UsageError(`--${k} takes no value`);
        (flags[k] ??= []).push("true");
      } else if (eq >= 0) (flags[k] ??= []).push(a.slice(eq + 1));
      else {
        if (i + 1 >= argv.length) throw new UsageError(`--${k} needs a value`);
        (flags[k] ??= []).push(argv[++i]);
      }
    } else pos.push(a);
  }
  return {
    pos,
    flags,
    get: (k) => flags[k]?.[0],
    all: (k) => flags[k] ?? [],
    has: (k) => k in flags,
    need: (k) => {
      const v = flags[k]?.[0];
      if (v === void 0) throw new UsageError(`--${k} is required`);
      return v;
    }
  };
}
async function guard(fn) {
  try {
    const r = await fn();
    process.stdout.write(typeof r === "string" ? r.endsWith("\n") ? r : r + "\n" : JSON.stringify(r ?? {}) + "\n");
    return 0;
  } catch (e) {
    process.stderr.write(`${e.message}
`);
    return e instanceof UsageError ? 2 : 1;
  }
}
function secret(ctx, key) {
  const name = String(ctx.options[key] ?? "");
  const v = name && ctx.env[name];
  if (!v) throw new Error(`env var named by options.${key} (${name || "unset"}) is not set`);
  return v;
}
var UsageError;
var init_util = __esm({
  "src/forge/util.ts"() {
    "use strict";
    UsageError = class extends Error {
    };
  }
});

// src/comments.ts
function parseKind(k) {
  if (!isKind(k)) throw new UsageError(`unknown comment kind '${k}' (kinds: ${KINDS.join(", ")})`);
  return k;
}
function parseWritableKind(k) {
  const kind = parseKind(k);
  if (VERB_ONLY[kind]) throw new UsageError(`comment kind '${kind}' is written only by '${VERB_ONLY[kind]}'`);
  return kind;
}
function stamp(kind, ref, ctx = {}) {
  const d = REGISTRY[kind];
  const r = oneLine(ref);
  if (r !== void 0 && d.ref === "none") throw new UsageError(`comment kind '${kind}' takes no --ref`);
  if (r === void 0 && d.ref === "required") throw new UsageError(`comment kind '${kind}' needs --ref`);
  if (d.style === "text") return d.open(ctx);
  if (d.style === "heading") return r ? `${d.open(ctx)}: ${r}` : d.open(ctx);
  return r ? `${d.open(ctx)} ${r} -->` : `${d.open(ctx)} -->`;
}
function matches(kind, ref, ctx = {}) {
  const d = REGISTRY[kind];
  const r = oneLine(ref);
  if (d.style === "html") return r ? `${d.open(ctx)} ${r} ` : d.open(ctx);
  if (d.style === "heading") return r ? `${d.open(ctx)}: ${r}` : d.open(ctx);
  return d.open(ctx);
}
function stampBody(body, kind, ref, ctx = {}) {
  const line = stamp(kind, ref, ctx);
  const rest = firstLine(body).trim() === line ? body.split("\n").slice(1).join("\n") : body;
  return `${line}
${rest.replace(/^\n+/, "")}`;
}
function verdictOf(body) {
  const all = new Set([...body.matchAll(VERDICT_LINE)].map((m) => m[1]));
  return all.size > 1 ? "CONFLICT" : [...all][0];
}
function selectComments(list, o) {
  const w = o.owners;
  let out = o.marker ? list.filter((c) => firstLine(c.body).includes(o.marker)) : list;
  if (o.authors?.length || o.trusted) {
    const by = [...o.authors ?? [], ...o.trusted ? [...w?.bots ?? [], ...w?.product ?? [], ...w?.factory ?? [], ...w?.operator ?? [], ...w?.security ?? [], ...w?.compliance ?? []] : []].filter((x) => !!x).map((s) => s.toLowerCase());
    out = out.filter((c) => by.includes(c.author?.toLowerCase()));
  }
  return o.last ? out.slice(0, o.last) : out;
}
var KINDS, html, REGISTRY, isKind, VERB_ONLY, oneLine, firstLine, isMarked, VERDICT_LINE;
var init_comments = __esm({
  "src/comments.ts"() {
    "use strict";
    init_util();
    KINDS = ["spec", "verdict", "note", "verify", "manual-check", "ask", "heartbeat", "scores", "release-proposal", "release-cut", "dispatch", "done"];
    html = (name, ref) => ({ ref, style: "html", open: () => `<!-- ${name}` });
    REGISTRY = {
      spec: { ref: "none", style: "text", open: (c) => c.specMarker ?? "spec.md" },
      // The wire names `review-pr` and `verify-ux` are the markers existing boards and CRs already hold; they stay.
      verdict: html("review-pr", "optional"),
      // ref: the CR head sha
      note: html("note", "optional"),
      verify: html("verify-ux", "optional"),
      "manual-check": html("manual-check", "optional"),
      // ref: the head sha
      ask: { ref: "optional", style: "heading", open: () => "### Needs human" },
      // ref: the trigger
      heartbeat: html("heartbeat", "none"),
      scores: html("scores", "none"),
      "release-proposal": html("release-proposal", "required"),
      // ref: the revision
      "release-cut": html("release-cut", "required"),
      // ref: the version
      dispatch: html("agentic-sdlc:dispatch", "required"),
      // ref: the run key
      done: html("agentic-sdlc:done", "required")
      // ref: the run key
    };
    isKind = (k) => KINDS.includes(k);
    VERB_ONLY = { verdict: "forge verdict", dispatch: "dispatch", scores: "ledger record" };
    oneLine = (ref) => {
      if (ref !== void 0 && (!ref.trim() || /[\r\n]/.test(ref))) throw new UsageError("--ref must be one non-empty line");
      return ref?.trim();
    };
    firstLine = (body) => body.split("\n")[0];
    isMarked = (body, kind, ref, ctx = {}) => firstLine(body).includes(matches(kind, ref, ctx));
    VERDICT_LINE = /^Verdict:[ \t]*(PASS|REMEDIATION REQUIRED)[ \t]*$/gm;
  }
});

// src/board/github.ts
function createGithubBoard(ctx) {
  const o = ctx.options;
  const num = String(o.project_number);
  const env = () => {
    if (!o.token_env) return void 0;
    const t = ctx.env[o.token_env];
    if (!t) throw new Error(`set ${o.token_env} (board.options.token_env) for the GitHub board`);
    return { ...ctx.env, GH_TOKEN: t };
  };
  const gh = async (args) => ghRetry(ctx.exec, args, { env: env() });
  const json = async (args) => JSON.parse(await gh(args) || "null");
  const fieldName = (f) => ctx.binding?.board?.fields?.[f] ?? DEFAULT_FIELDS[f];
  let projectId;
  let fieldCache;
  const pid = async () => projectId ??= (await json(["project", "view", num, "--owner", o.owner, "--format", "json"])).id;
  const fields = async () => fieldCache ??= (await json(["project", "field-list", num, "--owner", o.owner, "--format", "json"])).fields;
  const field = async (name) => {
    const f = (await fields()).find((x) => x.name === name);
    if (!f) throw new Error(`the board has no field '${name}'`);
    return f;
  };
  const itemId = async (id) => (await json(["project", "item-add", num, "--owner", o.owner, "--url", `https://github.com/${o.repo}/issues/${id}`, "--format", "json"])).id;
  const edit = async (id, f, rest) => gh(["project", "item-edit", "--project-id", await pid(), "--id", await itemId(id), "--field-id", f.id, ...rest]);
  const setOption = async (id, name, option) => {
    const f = await field(name);
    const opt = f.options?.find((x) => x.name === option);
    if (!opt) throw new Error(`the board has no field '${name}' with an option '${option}'`);
    await edit(id, f, ["--single-select-option-id", opt.id]);
  };
  const raw = (it, name) => {
    const v = it[name] ?? it[name[0].toLowerCase() + name.slice(1)] ?? it[name.toLowerCase()];
    return v === void 0 || v === null ? void 0 : String(v);
  };
  const toItem = (it) => {
    const fs = {};
    for (const k of Object.keys(DEFAULT_FIELDS)) {
      const v = raw(it, fieldName(k));
      if (v !== void 0) fs[k] = v;
    }
    const c = it.content ?? {};
    return {
      id: String(c.number),
      title: c.title ?? it.title,
      url: c.url ?? "",
      status: it.status ?? "",
      labels: it.labels ?? [],
      fields: fs,
      milestone: it.milestone?.title,
      children: [],
      assignees: it.assignees ?? [],
      createdAt: "",
      updatedAt: ""
    };
  };
  const ITEM_CAP = 5e3, SEARCH_CAP = 200;
  const items = async () => {
    const all = (await json(["project", "item-list", num, "--owner", o.owner, "--limit", String(ITEM_CAP), "--format", "json"])).items;
    if (all.length >= ITEM_CAP) throw new Error(`the board has ${ITEM_CAP} or more items: archive Done items (gh project item-archive) so every ticket is read`);
    const repo = String(o.repo).toLowerCase();
    return all.filter((i) => i.content?.number !== void 0 && (!i.content.repository || String(i.content.repository).toLowerCase() === repo));
  };
  const get = async (id) => {
    const it = (await items()).find((i) => String(i.content.number) === id);
    if (!it) throw new Error(`#${id} is not on the board`);
    const out = toItem(it);
    const v = await json(["issue", "view", id, "--repo", o.repo, "--json", "body,createdAt,updatedAt,assignees,milestone,labels"]);
    Object.assign(out, {
      body: v.body,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      assignees: v.assignees.map((a) => a.login),
      labels: v.labels.map((l) => l.name),
      milestone: v.milestone?.title
    });
    try {
      const subs = await json(["api", `repos/${o.repo}/issues/${id}/sub_issues`]);
      out.children = subs.map((s) => String(s.number));
      const p = await json(["api", `repos/${o.repo}/issues/${id}/parent`]);
      if (p?.number) out.parent = String(p.number);
    } catch {
    }
    return out;
  };
  const move = async (id, status, onlyFrom) => {
    if (onlyFrom) {
      const cur = (await items()).find((i) => String(i.content.number) === id)?.status ?? "";
      if (cur !== onlyFrom) throw new MovedError(id, onlyFrom, cur);
    }
    await setOption(id, "Status", status);
    return get(id);
  };
  return {
    async list(q = {}) {
      let hits;
      if (q.search) {
        const found = await json(["issue", "list", "--repo", o.repo, "--state", "all", "--search", q.search, "--limit", String(SEARCH_CAP), "--json", "number"]);
        if (found.length >= SEARCH_CAP) throw new Error(`the search matched ${SEARCH_CAP} or more issues: narrow it`);
        hits = new Set(found.map((x) => String(x.number)));
      }
      return (await items()).map(toItem).filter((i) => (!hits || hits.has(i.id)) && (!q.status?.length || q.status.includes(i.status)) && (!q.label || i.labels.includes(q.label)));
    },
    get,
    async create(t) {
      const args = ["issue", "create", "--repo", o.repo, "--title", t.title, "--body", t.body];
      for (const l of t.labels ?? []) args.push("--label", l);
      if (t.milestone) args.push("--milestone", t.milestone);
      const id = (await gh(args)).trim().split("/").pop();
      await move(id, t.status);
      if (t.parent) await this.child(t.parent, id);
      return get(id);
    },
    move,
    async set(id, f, value) {
      const fd = await field(fieldName(f));
      if (value === null) await edit(id, fd, ["--clear"]);
      else if (fd.options) await setOption(id, fd.name, value);
      else await edit(id, fd, ["--text", value]);
      return get(id);
    },
    async label(id, op, label) {
      await gh(["issue", "edit", id, "--repo", o.repo, op === "add" ? "--add-label" : "--remove-label", label]);
      return get(id);
    },
    async assign(id, user) {
      const drop = (await get(id)).assignees.filter((a) => a !== user).flatMap((a) => ["--remove-assignee", a]);
      const args = ["issue", "edit", id, "--repo", o.repo, ...user ? ["--add-assignee", user] : [], ...drop];
      if (args.length > 5) await gh(args);
      return get(id);
    },
    async milestone(id, name) {
      await gh(["issue", "edit", id, "--repo", o.repo, ...name === null ? ["--remove-milestone"] : ["--milestone", name]]);
      return get(id);
    },
    async comment(id, body) {
      const url = (await gh(["issue", "comment", id, "--repo", o.repo, "--body", body])).trim();
      return { id: url.split("issuecomment-")[1] ?? url, url };
    },
    async comments(id, q = {}) {
      const all = (await json(["api", `repos/${o.repo}/issues/${id}/comments`, "--paginate", "--slurp"])).flat();
      let list = all.map((c) => ({ id: String(c.id), author: c.user?.login ?? "", createdAt: c.created_at, body: c.body ?? "", url: c.html_url })).reverse();
      if (q.marker) list = list.filter((c) => c.body.split("\n")[0].includes(q.marker));
      return q.last ? list.slice(0, q.last) : list;
    },
    async close(id, reason) {
      await gh(["issue", "close", id, "--repo", o.repo, "--reason", reason === "completed" ? "completed" : "not planned"]);
      return move(id, reason === "completed" ? "Done" : "Cancelled");
    },
    async child(parent, child) {
      const cid = (await json(["api", `repos/${o.repo}/issues/${child}`])).id;
      await gh(["api", `repos/${o.repo}/issues/${parent}/sub_issues`, "-X", "POST", "-F", `sub_issue_id=${cid}`]);
      return get(parent);
    }
  };
}
var DEFAULT_FIELDS;
var init_github = __esm({
  "src/board/github.ts"() {
    "use strict";
    init_ports();
    init_exec();
    DEFAULT_FIELDS = { size: "Size", priority: "Priority", lane: "Lane", shipped: "Shipped", release_version: "Release Version" };
  }
});

// src/board/github-issues.ts
function createGithubIssuesBoard(ctx) {
  const repo = String(ctx.options.repo);
  const api = async (method, path, body) => {
    const args = ["api", "-X", method, `repos/${repo}/${path}`];
    if (body !== void 0) args.push("--input", "-");
    const out = await ghRetry(ctx.exec, args, body === void 0 ? {} : { input: JSON.stringify(body) });
    return out.trim() ? JSON.parse(out) : null;
  };
  const all = async (path) => {
    const out = [];
    for (let page = 1; ; page++) {
      const r = await api("GET", `${path}${path.includes("?") ? "&" : "?"}per_page=${PAGE}&page=${page}`) ?? [];
      out.push(...r);
      if (r.length < PAGE) return out;
    }
  };
  const prefix = (f) => `${(ctx.binding?.board?.fields?.[f] ?? f).toLowerCase()}:`;
  const names = (i) => (i.labels ?? []).map((l) => typeof l === "string" ? l : l.name);
  const statusOf = (i) => names(i).find((l) => l.toLowerCase().startsWith(STATUS))?.slice(STATUS.length);
  const toItem = (i) => {
    const fields = {}, labels = [];
    let status = "";
    for (const l of names(i)) {
      const low = l.toLowerCase();
      const f = LOGICAL.find((k) => low.startsWith(prefix(k)));
      if (f) fields[f] = l.slice(prefix(f).length);
      else if (low.startsWith(STATUS)) status = l.slice(STATUS.length);
      else labels.push(l);
    }
    return {
      id: String(i.number),
      title: i.title,
      url: i.html_url ?? "",
      status,
      labels,
      fields,
      milestone: i.milestone?.title ?? void 0,
      children: [],
      assignees: (i.assignees ?? []).map((a) => a.login),
      createdAt: i.created_at ?? "",
      updatedAt: i.updated_at ?? "",
      body: i.body ?? "",
      // The list carries no status change time: a closed issue at Done reached Done when it closed.
      ...status === "Done" && i.closed_at ? { statusChangedAt: i.closed_at } : {}
    };
  };
  let known;
  const ensureLabels = async (ls) => {
    known ??= new Set((await all("labels")).map((l) => String(l.name).toLowerCase()));
    for (const name of ls) if (!known.has(name.toLowerCase())) {
      await api("POST", "labels", { name });
      known.add(name.toLowerCase());
    }
  };
  const issue = (id) => api("GET", `issues/${id}`);
  const relabel = async (i, drop, add, extra = {}) => {
    await ensureLabels(add);
    const labels = [.../* @__PURE__ */ new Set([...names(i).filter((l) => !drop(l.toLowerCase())), ...add])];
    await api("PATCH", `issues/${i.number}`, { ...extra, labels });
  };
  const get = async (id) => {
    const raw = await issue(id);
    if (raw.pull_request || statusOf(raw) === void 0) throw new Error(`#${id} is not on the board`);
    const out = toItem(raw);
    try {
      out.children = (await all(`issues/${id}/sub_issues`)).map((s) => String(s.number));
      const p = await api("GET", `issues/${id}/parent`);
      if (p?.number) out.parent = String(p.number);
    } catch {
    }
    return out;
  };
  const move = async (id, status, onlyFrom, extra) => {
    const i = await issue(id);
    const cur = statusOf(i) ?? "";
    if (onlyFrom && cur !== onlyFrom) throw new MovedError(id, onlyFrom, cur);
    await relabel(i, (l) => l.startsWith(STATUS), [STATUS + status], extra);
    return get(id);
  };
  const milestone = async (title) => {
    const m = (await all("milestones?state=all")).find((x) => x.title === title);
    if (!m) throw new Error(`${repo} has no milestone '${title}'`);
    return m.number;
  };
  return {
    async list(q = {}) {
      const words2 = (q.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      return (await all("issues?state=all")).filter((i) => !i.pull_request && statusOf(i) !== void 0).filter((i) => words2.every((w) => `${i.title}
${i.body ?? ""}`.toLowerCase().includes(w))).map(toItem).filter((i) => (!q.status?.length || q.status.includes(i.status)) && (!q.label || i.labels.includes(q.label)));
    },
    get,
    async create(t) {
      const labels = [.../* @__PURE__ */ new Set([...t.labels ?? [], STATUS + t.status])];
      await ensureLabels(labels);
      const body = { title: t.title, body: t.body, labels };
      if (t.milestone) body.milestone = await milestone(t.milestone);
      const id = String((await api("POST", "issues", body)).number);
      if (t.parent) await this.child(t.parent, id);
      return get(id);
    },
    move: (id, status, onlyFrom) => move(id, status, onlyFrom),
    async set(id, f, value) {
      const p = prefix(f);
      await relabel(await issue(id), (l) => l.startsWith(p), value === null ? [] : [p + value]);
      return get(id);
    },
    async label(id, op, label) {
      await relabel(await issue(id), (l) => op === "remove" && l === label.toLowerCase(), op === "add" ? [label] : []);
      return get(id);
    },
    async assign(id, user) {
      await api("PATCH", `issues/${id}`, { assignees: user ? [user] : [] });
      return get(id);
    },
    async milestone(id, name) {
      await api("PATCH", `issues/${id}`, { milestone: name === null ? null : await milestone(name) });
      return get(id);
    },
    async comment(id, body) {
      const c = await api("POST", `issues/${id}/comments`, { body });
      return { id: String(c.id), url: c.html_url };
    },
    async comments(id, q = {}) {
      let list = (await all(`issues/${id}/comments`)).map((c) => ({ id: String(c.id), author: c.user?.login ?? "", createdAt: c.created_at, body: c.body ?? "", url: c.html_url })).reverse();
      if (q.marker) list = list.filter((c) => c.body.split("\n")[0].includes(q.marker));
      return q.last ? list.slice(0, q.last) : list;
    },
    close(id, reason) {
      return move(id, reason === "completed" ? "Done" : "Cancelled", void 0, { state: "closed", state_reason: reason });
    },
    async child(parent, child) {
      await api("POST", `issues/${parent}/sub_issues`, { sub_issue_id: (await issue(child)).id });
      return get(parent);
    }
  };
}
var LOGICAL, STATUS, PAGE;
var init_github_issues = __esm({
  "src/board/github-issues.ts"() {
    "use strict";
    init_ports();
    init_exec();
    LOGICAL = ["size", "priority", "lane", "shipped", "release_version"];
    STATUS = "status:";
    PAGE = 100;
  }
});

// src/board/jira.ts
function createJiraBoard(ctx) {
  const o = ctx.options;
  const base = o.base_url.replace(/\/$/, "");
  const auth = () => {
    const e = ctx.env[o.email_env], t = ctx.env[o.token_env];
    if (!e || !t) throw new Error(`set ${o.email_env} and ${o.token_env} for the Jira board`);
    return "Basic " + Buffer.from(`${e}:${t}`).toString("base64");
  };
  const api = (method, path, body) => ctx.http(method, `${base}/rest/api/3${path}`, { headers: { authorization: auth() }, body });
  const fieldName = (f) => ctx.binding?.board?.fields?.[f];
  let fieldCache;
  const jiraField = async (f) => {
    const name = fieldName(f);
    if (!name) throw new Error(`binding board.fields.${f} is not set`);
    fieldCache ??= await api("GET", "/field");
    const hit = fieldCache.find((x) => x.name === name);
    if (!hit) throw new Error(`Jira has no field '${name}'`);
    return hit;
  };
  const fieldIds = async () => {
    const m = {};
    for (const f of LOGICAL2) if (fieldName(f)) m[f] = (await jiraField(f)).id;
    return m;
  };
  const toItem = async (i) => {
    const f = i.fields, ids = await fieldIds(), fs = {};
    for (const k of Object.keys(ids)) {
      const v = f[ids[k]];
      if (v !== null && v !== void 0) fs[k] = typeof v === "object" ? v.value ?? v.name ?? "" : String(v);
    }
    return {
      id: i.key,
      title: f.summary,
      url: `${base}/browse/${i.key}`,
      status: f.status?.name ?? "",
      kind: f.issuetype?.name,
      labels: f.labels ?? [],
      fields: fs,
      milestone: f.fixVersions?.[0]?.name,
      parent: f.parent?.key,
      children: (f.subtasks ?? []).map((s) => s.key),
      assignees: f.assignee ? [f.assignee.accountId] : [],
      createdAt: f.created,
      updatedAt: f.updated,
      statusChangedAt: f.statuscategorychangedate,
      body: adfText(f.description)
    };
  };
  const fetchFields = async () => ["summary", "status", "issuetype", "labels", "parent", "subtasks", "assignee", "created", "updated", "fixVersions", "description", "statuscategorychangedate", ...Object.values(await fieldIds())].join(",");
  const get = async (id) => toItem(await api("GET", `/issue/${id}?fields=${await fetchFields()}`));
  const transition = async (id, status) => {
    const t = (await api("GET", `/issue/${id}/transitions`)).transitions.find((x) => x.to?.name === status);
    if (!t) throw new Error(`${id} has no transition to '${status}'`);
    await api("POST", `/issue/${id}/transitions`, { transition: { id: t.id } });
  };
  const put = async (id, fields) => {
    await api("PUT", `/issue/${id}`, { fields });
    return get(id);
  };
  const move = async (id, status, onlyFrom) => {
    if (onlyFrom) {
      const cur = (await api("GET", `/issue/${id}?fields=status`)).fields.status.name;
      if (cur !== onlyFrom) throw new MovedError(id, onlyFrom, cur);
    }
    await transition(id, status);
    return get(id);
  };
  const quote2 = (s) => `"${s.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  return {
    async list(q = {}) {
      const jql = [`project = ${o.project_key}`];
      if (q.status?.length) jql.push(`status in (${q.status.map(quote2).join(",")})`);
      if (q.label) jql.push(`labels = ${quote2(q.label)}`);
      if (q.search) jql.push(`text ~ ${quote2(q.search)}`);
      const fields = (await fetchFields()).split(",");
      const issues = [];
      let nextPageToken;
      for (let page = 1; ; page++) {
        const r = await api("POST", "/search/jql", { jql: jql.join(" AND ") + " ORDER BY created ASC", maxResults: 100, fields, ...nextPageToken ? { nextPageToken } : {} });
        issues.push(...r.issues);
        const next = r.isLast === true ? void 0 : r.nextPageToken;
        if (!next) break;
        if (!r.issues.length || next === nextPageToken || page >= 500) throw new Error("jira: list does not advance (empty page, repeated token or over 500 pages); stopping");
        nextPageToken = next;
      }
      return Promise.all(issues.map(toItem));
    },
    get,
    async create(t) {
      const fields = {
        project: { key: o.project_key },
        summary: t.title,
        description: adf(t.body),
        issuetype: { name: t.parent ? "Sub-task" : "Task" }
      };
      if (t.labels?.length) fields.labels = t.labels;
      if (t.parent) fields.parent = { key: t.parent };
      if (t.milestone) fields.fixVersions = [{ name: t.milestone }];
      const { key } = await api("POST", "/issue", { fields });
      return move(key, t.status);
    },
    move,
    async set(id, f, value) {
      const fd = await jiraField(f);
      return put(id, { [fd.id]: value === null ? null : fd.schema?.type === "option" ? { value } : value });
    },
    async label(id, op, label) {
      await api("PUT", `/issue/${id}`, { update: { labels: [{ [op]: label }] } });
      return get(id);
    },
    async assign(id, user) {
      await api("PUT", `/issue/${id}/assignee`, { accountId: user });
      return get(id);
    },
    milestone(id, name) {
      return put(id, { fixVersions: name === null ? [] : [{ name }] });
    },
    async comment(id, body) {
      const c = await api("POST", `/issue/${id}/comment`, { body: adf(body) });
      return { id: String(c.id), url: `${base}/browse/${id}?focusedCommentId=${c.id}` };
    },
    async comments(id, q = {}) {
      const raw = [];
      for (let page = 1; ; page++) {
        const r = await api("GET", `/issue/${id}/comment?orderBy=-created&maxResults=100&startAt=${raw.length}`);
        raw.push(...r.comments);
        if (raw.length >= r.total) break;
        if (!r.comments.length || page >= 500) throw new Error("jira: comments does not advance (empty page or over 500 pages); stopping");
      }
      let list = raw.map((c) => ({
        id: String(c.id),
        author: c.author?.accountId ?? "",
        createdAt: c.created,
        body: adfText(c.body),
        url: `${base}/browse/${id}?focusedCommentId=${c.id}`
      }));
      if (q.marker) list = list.filter((c) => c.body.split("\n")[0].includes(q.marker));
      return q.last ? list.slice(0, q.last) : list;
    },
    close(id, reason) {
      return move(id, reason === "completed" ? "Done" : "Cancelled");
    },
    async child(parent, child) {
      await api("PUT", `/issue/${child}`, { fields: { parent: { key: parent } } });
      return get(parent);
    }
  };
}
var LOGICAL2, adf, adfText;
var init_jira = __esm({
  "src/board/jira.ts"() {
    "use strict";
    init_ports();
    LOGICAL2 = ["size", "priority", "lane", "shipped", "release_version"];
    adf = (text) => ({
      type: "doc",
      version: 1,
      content: text.split("\n").filter((l) => l.trim()).map((l) => ({ type: "paragraph", content: [{ type: "text", text: l }] }))
    });
    adfText = (n) => !n ? "" : typeof n.text === "string" ? n.text : (n.content ?? []).map(adfText).join(n.type === "doc" ? "\n" : "");
  }
});

// src/board/linear.ts
function createLinearBoard(ctx) {
  const o = ctx.options;
  const gql = async (query, variables = {}) => {
    const token = ctx.env[o.token_env];
    if (!token) throw new Error(`set ${o.token_env} for the Linear board`);
    const r = await ctx.http("POST", "https://api.linear.app/graphql", { headers: { authorization: token }, body: { query, variables } });
    if (r.errors?.length) throw new Error(`Linear: ${r.errors[0].message}`);
    return r.data;
  };
  const fieldName = (f) => ctx.binding?.board?.fields?.[f] ?? f;
  const nativePriority = () => fieldName("priority").toLowerCase() === "priority";
  const priorities = () => ctx.binding?.priorities ?? [];
  let team;
  const getTeam = async () => team ??= (await gql(`query($k:String!){ teams(filter:{key:{eq:$k}}){ nodes { id states(first:250) { nodes { id name } } labels(first:250) { nodes { id name } } } } }`, { k: o.team_key })).teams.nodes[0];
  const state = async (name) => {
    const s = (await getTeam()).states.nodes.find((x) => x.name === name);
    if (!s) throw new Error(`Linear team ${o.team_key} has no state '${name}'`);
    return s.id;
  };
  const labelId = async (name) => {
    const t = await getTeam();
    let l = t.labels.nodes.find((x) => x.name === name);
    if (!l) {
      l = (await gql(`mutation($i:IssueLabelCreateInput!){ issueLabelCreate(input:$i){ issueLabel { id name } } }`, { i: { teamId: t.id, name } })).issueLabelCreate.issueLabel;
      t.labels.nodes.push(l);
    }
    return l.id;
  };
  const prefix = (f) => `${f}:`;
  const toItem = (i) => {
    const fs = {}, labels = [];
    let milestone;
    for (const l of i.labels.nodes.map((x) => x.name)) {
      const f = LOGICAL3.find((k) => !(k === "priority" && nativePriority()) && l.startsWith(prefix(fieldName(k))));
      if (f) fs[f] = l.slice(prefix(fieldName(f)).length);
      else if (l.startsWith("milestone:")) milestone = l.slice(10);
      else labels.push(l);
    }
    if (nativePriority() && i.priority) fs.priority = priorities()[i.priority - 1] ?? String(i.priority);
    return {
      id: i.identifier,
      title: i.title,
      url: i.url,
      status: i.state.name,
      labels,
      fields: fs,
      milestone,
      parent: i.parent?.identifier,
      children: i.children.nodes.map((c) => c.identifier),
      assignees: i.assignee ? [i.assignee.id] : [],
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      body: i.description ?? ""
    };
  };
  const raw = async (id) => (await gql(`query($id:String!){ issue(id:$id){ ${ISSUE} } }`, { id })).issue;
  const get = async (id) => toItem(await raw(id));
  const update = async (id, input) => {
    const u = (await raw(id)).id;
    const r = await gql(`mutation($id:String!,$i:IssueUpdateInput!){ issueUpdate(id:$id,input:$i){ issue { ${ISSUE} } } }`, { id: u, i: input });
    return toItem(r.issueUpdate.issue);
  };
  const withLabels = async (id, change) => {
    const own = (await raw(id)).labels.nodes;
    const names = change(own.map((l) => l.name));
    return update(id, { labelIds: await Promise.all(names.map((n) => own.find((l) => l.name === n)?.id ?? labelId(n))) });
  };
  const move = async (id, status, onlyFrom) => {
    if (onlyFrom) {
      const cur = (await raw(id)).state.name;
      if (cur !== onlyFrom) throw new MovedError(id, onlyFrom, cur);
    }
    return update(id, { stateId: await state(status) });
  };
  return {
    async list(q = {}) {
      const filter = { team: { key: { eq: o.team_key } } };
      if (q.status?.length) filter.state = { name: { in: q.status } };
      if (q.label) filter.labels = { name: { eq: q.label } };
      const ws = (q.search ?? "").split(/\s+/).filter(Boolean);
      if (ws.length) filter.and = ws.map((w) => ({ or: [{ title: { containsIgnoreCase: w } }, { description: { containsIgnoreCase: w } }] }));
      const nodes = [];
      let a = null;
      for (let page = 1; ; page++) {
        const r = await gql(`query($f:IssueFilter,$a:String){ issues(filter:$f, first:100, after:$a){ nodes { ${ISSUE} } pageInfo { hasNextPage endCursor } } }`, { f: filter, a });
        nodes.push(...r.issues.nodes);
        if (!r.issues.pageInfo.hasNextPage) break;
        if (!r.issues.nodes.length || r.issues.pageInfo.endCursor === a || page >= 500) throw new Error("linear: list does not advance (empty page, repeated cursor or over 500 pages); stopping");
        a = r.issues.pageInfo.endCursor;
      }
      return nodes.map(toItem);
    },
    get,
    async create(t) {
      const names = [...t.labels ?? [], ...t.milestone ? [`milestone:${t.milestone}`] : []];
      const input = {
        teamId: (await getTeam()).id,
        title: t.title,
        description: t.body,
        stateId: await state(t.status),
        labelIds: await Promise.all(names.map(labelId))
      };
      if (t.parent) input.parentId = (await raw(t.parent)).id;
      const r = await gql(`mutation($i:IssueCreateInput!){ issueCreate(input:$i){ issue { ${ISSUE} } } }`, { i: input });
      return toItem(r.issueCreate.issue);
    },
    move,
    async set(id, f, value) {
      if (f === "priority" && nativePriority()) {
        const n = value === null ? 0 : priorities().indexOf(value) + 1;
        if (value !== null && !n) throw new Error(`'${value}' is not in binding priorities`);
        return update(id, { priority: n });
      }
      const p = prefix(fieldName(f));
      return withLabels(id, (ls) => [...ls.filter((l) => !l.startsWith(p)), ...value === null ? [] : [p + value]]);
    },
    label(id, op, label) {
      return withLabels(id, (ls) => op === "add" ? [.../* @__PURE__ */ new Set([...ls, label])] : ls.filter((l) => l !== label));
    },
    assign(id, user) {
      return update(id, { assigneeId: user });
    },
    milestone(id, name) {
      return withLabels(id, (ls) => [...ls.filter((l) => !l.startsWith("milestone:")), ...name === null ? [] : [`milestone:${name}`]]);
    },
    async comment(id, body) {
      const r = await gql(`mutation($i:CommentCreateInput!){ commentCreate(input:$i){ comment { id url } } }`, { i: { issueId: (await raw(id)).id, body } });
      return r.commentCreate.comment;
    },
    async comments(id, q = {}) {
      const nodes = [];
      let a = null;
      for (let page = 1; ; page++) {
        const r = await gql(`query($id:String!,$a:String){ issue(id:$id){ comments(first:100, after:$a){ nodes { id body createdAt url user { id } } pageInfo { hasNextPage endCursor } } } }`, { id, a });
        const c = r.issue.comments;
        nodes.push(...c.nodes);
        if (!c.pageInfo.hasNextPage) break;
        if (!c.nodes.length || c.pageInfo.endCursor === a || page >= 500) throw new Error("linear: comments does not advance (empty page, repeated cursor or over 500 pages); stopping");
        a = c.pageInfo.endCursor;
      }
      let list = nodes.map((c) => ({ id: c.id, author: c.user?.id ?? "", createdAt: c.createdAt, body: c.body, url: c.url })).sort((a2, b) => b.createdAt.localeCompare(a2.createdAt));
      if (q.marker) list = list.filter((c) => c.body.split("\n")[0].includes(q.marker));
      return q.last ? list.slice(0, q.last) : list;
    },
    close(id, reason) {
      return move(id, reason === "completed" ? "Done" : "Cancelled");
    },
    async child(parent, child) {
      await update(child, { parentId: (await raw(parent)).id });
      return get(parent);
    }
  };
}
var LOGICAL3, ISSUE;
var init_linear = __esm({
  "src/board/linear.ts"() {
    "use strict";
    init_ports();
    LOGICAL3 = ["size", "priority", "lane", "shipped", "release_version"];
    ISSUE = `id identifier title url description createdAt updatedAt priority state { name } labels(first:250) { nodes { id name } }
  assignee { id } parent { identifier } children(first:250) { nodes { identifier } }`;
  }
});

// src/board/local.ts
import { existsSync, mkdirSync, readFileSync as readFileSync3, writeFileSync } from "fs";
import { dirname, join as join2 } from "path";
function createLocalBoard(ctx) {
  const file = join2(ctx.root, ".agents", "board.json");
  const load = () => existsSync(file) ? JSON.parse(readFileSync3(file, "utf8")) : { items: [], comments: {} };
  const save = (db) => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(db, null, 2));
  };
  const now = () => (/* @__PURE__ */ new Date()).toISOString();
  const find = (db, id) => {
    const it = db.items.find((i) => i.id === id);
    if (!it) throw new Error(`no item ${id}`);
    return it;
  };
  const edit = async (id, fn) => {
    const db = load();
    const it = find(db, id);
    fn(it, db);
    it.updatedAt = now();
    save(db);
    return it;
  };
  const setStatus = (it, s) => {
    it.status = s;
    it.statusChangedAt = now();
  };
  return {
    async list(q = {}) {
      return load().items.filter((i) => (!q.status?.length || q.status.includes(i.status)) && (!q.label || i.labels.includes(q.label)) && words(q.search).every((w) => `${i.title} ${i.body ?? ""}`.toLowerCase().includes(w)));
    },
    async get(id) {
      return find(load(), id);
    },
    async create(t) {
      const db = load();
      const id = String(Math.max(0, ...db.items.map((i) => Number(i.id))) + 1);
      const at = now();
      const it = {
        id,
        title: t.title,
        body: t.body,
        url: `local:${id}`,
        status: t.status,
        labels: t.labels ?? [],
        fields: {},
        milestone: t.milestone,
        parent: t.parent,
        children: [],
        assignees: [],
        createdAt: at,
        updatedAt: at,
        statusChangedAt: at
      };
      db.items.push(it);
      if (t.parent) find(db, t.parent).children.push(id);
      save(db);
      return it;
    },
    move(id, status, onlyFrom) {
      return edit(id, (it) => {
        if (onlyFrom && it.status !== onlyFrom) throw new MovedError(id, onlyFrom, it.status);
        setStatus(it, status);
      });
    },
    set(id, field, value) {
      return edit(id, (it) => {
        if (value === null) delete it.fields[field];
        else it.fields[field] = value;
      });
    },
    label(id, op, label) {
      return edit(id, (it) => {
        it.labels = it.labels.filter((l) => l !== label);
        if (op === "add") it.labels.push(label);
      });
    },
    assign(id, user) {
      return edit(id, (it) => {
        it.assignees = user ? [user] : [];
      });
    },
    milestone(id, name) {
      return edit(id, (it) => {
        if (name === null) delete it.milestone;
        else it.milestone = name;
      });
    },
    async comment(id, body) {
      const db = load();
      find(db, id);
      const list = db.comments[id] ??= [];
      const c = { id: String(list.length + 1), author: "local", createdAt: now(), body, url: `local:${id}#${list.length + 1}` };
      list.push(c);
      save(db);
      return { id: c.id, url: c.url };
    },
    async comments(id, q = {}) {
      let list = [...load().comments[id] ?? []].reverse();
      if (q.marker) list = list.filter((c) => c.body.split("\n")[0].includes(q.marker));
      return q.last ? list.slice(0, q.last) : list;
    },
    close(id, reason) {
      return edit(id, (it) => setStatus(it, reason === "completed" ? "Done" : "Cancelled"));
    },
    child(parent, child) {
      return edit(parent, (p, db) => {
        const c = find(db, child);
        c.parent = parent;
        if (!p.children.includes(child)) p.children.push(child);
      });
    }
  };
}
var words;
var init_local = __esm({
  "src/board/local.ts"() {
    "use strict";
    init_ports();
    words = (s = "") => s.toLowerCase().split(/\s+/).filter(Boolean);
  }
});

// src/board/index.ts
var board_exports = {};
__export(board_exports, {
  VERBS: () => VERBS,
  cli: () => cli,
  createBoard: () => createBoard,
  hold: () => hold,
  holds: () => holds
});
function createBoard(ctx) {
  const make = { github: createGithubBoard, "github-issues": createGithubIssuesBoard, jira: createJiraBoard, linear: createLinearBoard, local: createLocalBoard }[ctx.binding.board.adapter];
  if (!make) throw new Error(`unknown board adapter '${ctx.binding.board.adapter}'`);
  const missing = validateBinding({ ...ctx.binding, board: { ...ctx.binding.board, options: ctx.options } }).map((m) => /^board\.options\.(\w+) is required/.exec(m)?.[1]).filter(Boolean).map((k) => `board.options.${k}`);
  if (missing.length) throw new Error(`board adapter '${ctx.binding.board.adapter}' needs binding keys: ${missing.join(", ")}; run: agentic-sdlc validate`);
  const board = checked(make(ctx), ctx);
  const scope = ctx.binding.board.scope;
  if (!scope?.label) return board;
  const pre = scope.label.slice(0, scope.label.indexOf(":") + 1);
  const mine = (i) => i.labels.includes(scope.label) || !!scope.home && !i.labels.some((l) => l.startsWith(pre));
  return {
    ...board,
    list: async (q) => (await board.list(q)).filter(mine),
    create: (t) => board.create({ ...t, labels: [.../* @__PURE__ */ new Set([...t.labels ?? [], scope.label])] })
  };
}
function checked(b, ctx) {
  const numeric = ctx.binding.board.adapter === "github" || ctx.binding.board.adapter === "github-issues";
  const statuses = ctx.binding.board.statuses;
  const id = (v) => {
    if (numeric && v !== void 0 && !/^\d+$/.test(String(v))) throw new Error(`board: not an issue number: ${v}`);
    return v;
  };
  const status = (s) => {
    if (Array.isArray(statuses) && statuses.length && !statuses.includes(s)) throw new Error(`board: status '${s}' is not in board.statuses (${statuses.join(", ")})`);
    return s;
  };
  return {
    ...b,
    get: async (i) => b.get(id(i)),
    create: async (t) => {
      id(t.parent);
      status(t.status);
      return b.create(t);
    },
    move: async (i, s, from) => b.move(id(i), status(s), from),
    set: async (i, f, v) => b.set(id(i), f, v),
    label: async (i, op, l) => b.label(id(i), op, l),
    assign: async (i, u) => b.assign(id(i), u),
    milestone: async (i, m) => b.milestone(id(i), m),
    comment: async (i, body) => b.comment(id(i), body),
    comments: async (i, q) => b.comments(id(i), q),
    close: async (i, r) => b.close(id(i), r),
    child: async (p, c) => b.child(id(p), id(c))
  };
}
async function hold(board, b, id, kind, body) {
  const trigger = kind.trim();
  if (!trigger || /[\r\n]/.test(trigger)) throw new Usage("board hold: --kind is one non-empty line");
  const text = body.replace(/^### Needs human[^\n]*\n+/, "");
  const item = await board.label(id, "add", b.board.labels.human);
  await board.comment(id, `${stamp("ask", trigger)}

${text.trim()}
`);
  return item;
}
async function holds(board, b) {
  const o = ownersFor(b.owners, "board");
  const owners = new Set([...o.product, ...o.factory, ...o.operator, ...o.security, ...o.compliance].map((x) => x.toLowerCase()));
  const bots = new Set(o.bots.map((x) => x.toLowerCase()));
  const out = [];
  for (const item of await board.list({ label: b.board.labels.human })) {
    const all = [...await board.comments(item.id)].sort(byTime);
    const ask = all.find(asked);
    const line = ask?.body.split("\n")[0].slice(matches("ask").length).replace(/^:\s*/, "").trim();
    const after = ask ? all.filter((c) => !asked(c) && Date.parse(c.createdAt) > Date.parse(ask.createdAt)) : [];
    const reply = after.find((c) => {
      const a = c.author?.toLowerCase();
      return !!a && owners.has(a) && !bots.has(a);
    });
    out.push({
      id: item.id,
      kind: line || "unspecified",
      askedAt: ask?.createdAt ?? item.updatedAt,
      replied: !!reply,
      ...reply ? { reply: { author: reply.author, createdAt: reply.createdAt, ...reply.url ? { url: reply.url } : {} } } : {}
    });
  }
  return out;
}
var Usage, asked, byTime, VERBS, USAGE, cli;
var init_board = __esm({
  "src/board/index.ts"() {
    "use strict";
    init_ports();
    init_binding();
    init_comments();
    init_util();
    init_github();
    init_github_issues();
    init_jira();
    init_linear();
    init_local();
    Usage = UsageError;
    asked = (c) => isMarked(c.body, "ask");
    byTime = (x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt);
    VERBS = {
      list: { value: ["status", "label", "search"] },
      get: {},
      create: { value: ["title", "body-file", "status", "label", "parent", "milestone"] },
      move: { value: ["only-from"] },
      set: { bool: ["clear"] },
      label: {},
      assign: { bool: ["none"] },
      milestone: { bool: ["clear"] },
      comment: { value: ["body-file", "kind", "ref"] },
      comments: { value: ["last", "marker", "author", "kind", "ref"], bool: ["trusted"], num: ["last"] },
      hold: { value: ["kind", "body-file"] },
      holds: {},
      release: {},
      close: { value: ["reason"] },
      child: {}
    };
    USAGE = `usage: agentic-sdlc board <verb>
  list [--status <s>]... [--label <l>] [--search <text>]    get <id>
  create --title <t> --body-file <f> --status <s> [--label <l>]... [--parent <id>] [--milestone <m>]
  move <id> <status> [--only-from <s>]    set <id> <field> <value> | --clear
  milestone <id> <name> | --clear
  label <id> add|remove <label>           assign <id> <user> | --none
  comment <id> --body-file <f> [--kind <kind> [--ref <value>]]
  comments <id> [--last <n>] [--kind <kind> [--ref <value>] | --marker <text>] [--author <a>]... [--trusted]
  hold <id> --kind <trigger> --body-file <f>    holds    release <id>
  close <id> --reason completed|not_planned    child <parent> <child>`;
    cli = async (argv, base) => {
      const [verb, ...rest] = argv;
      try {
        if (!verb || verb === "--help") {
          console.log(USAGE);
          return verb ? 0 : 2;
        }
        if (!Object.hasOwn(VERBS, verb)) throw new Usage(`unknown board verb '${verb}'`);
        const a = parseStrict("board", verb, rest, VERBS[verb]);
        const need3 = (n) => {
          if (a.pos.length < n) throw new Usage(`board ${verb}: missing argument`);
        };
        const req = (k) => a.need(k);
        const body = () => bodyFile(a);
        const board = createBoard({ ...base, options: base.binding.board.options });
        const [id] = a.pos;
        let out;
        switch (verb) {
          case "list":
            out = await board.list({ status: a.all("status"), label: a.get("label"), search: a.get("search") });
            break;
          case "get":
            need3(1);
            out = await board.get(id);
            break;
          case "create":
            out = await board.create({
              title: req("title"),
              body: body(),
              status: req("status"),
              labels: a.all("label"),
              parent: a.get("parent"),
              milestone: a.get("milestone")
            });
            break;
          case "move":
            need3(2);
            out = await board.move(id, a.pos[1], a.get("only-from"));
            break;
          case "set":
            need3(a.has("clear") ? 2 : 3);
            out = await board.set(id, a.pos[1], a.has("clear") ? null : a.pos[2]);
            break;
          case "label":
            need3(3);
            if (a.pos[1] !== "add" && a.pos[1] !== "remove") throw new Usage("label: add or remove");
            out = await board.label(id, a.pos[1], a.pos[2]);
            break;
          case "assign":
            need3(a.has("none") ? 1 : 2);
            out = await board.assign(id, a.has("none") ? null : a.pos[1]);
            break;
          case "comment": {
            need3(1);
            if (a.has("ref") && !a.has("kind")) throw new Usage("board comment: --ref needs --kind");
            out = await board.comment(id, a.has("kind") ? stampBody(body(), parseWritableKind(a.get("kind")), a.get("ref"), { specMarker: base.binding.spec_marker }) : body());
            break;
          }
          case "hold":
            need3(1);
            out = await hold(board, base.binding, id, req("kind"), body());
            break;
          case "holds":
            out = await holds(board, base.binding);
            break;
          case "release":
            need3(1);
            out = await board.label(id, "remove", base.binding.board.labels.human);
            break;
          case "comments": {
            need3(1);
            if (a.has("kind") && a.has("marker")) throw new Usage("board comments: --kind and --marker together");
            if (a.has("ref") && !a.has("kind")) throw new Usage("board comments: --ref needs --kind");
            const marker = a.has("kind") ? matches(parseKind(a.get("kind")), a.get("ref"), { specMarker: base.binding.spec_marker }) : a.get("marker");
            out = selectComments(await board.comments(id, { marker }), {
              owners: ownersFor(base.binding.owners, "board"),
              authors: a.all("author"),
              trusted: a.has("trusted"),
              last: a.get("last") ? Number(a.get("last")) : void 0,
              marker
            });
            break;
          }
          case "close": {
            need3(1);
            const r = req("reason");
            if (r !== "completed" && r !== "not_planned") throw new Usage("--reason completed|not_planned");
            out = await board.close(id, r);
            break;
          }
          case "milestone":
            need3(a.has("clear") ? 1 : 2);
            if (a.has("clear") && a.pos.length > 1) throw new Usage("board milestone: a name and --clear together");
            out = await board.milestone(id, a.has("clear") ? null : a.pos[1]);
            break;
          case "child":
            need3(2);
            out = await board.child(id, a.pos[1]);
            break;
          default:
            throw new Usage(`unknown board verb '${verb}'`);
        }
        console.log(JSON.stringify(out, null, 2));
        return 0;
      } catch (e) {
        console.error(e.message);
        return e instanceof Usage ? 2 : 1;
      }
    };
  }
});

// src/forge/flow.ts
function buildReport(body, headSha, pass) {
  const verdict2 = pass ? "PASS" : "REMEDIATION REQUIRED";
  const mark = stamp("verdict", headSha);
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() === mark) lines.shift();
  const kept = [];
  for (const l of lines) {
    const m = /^Verdict:[ \t]*(.*?)[ \t]*$/.exec(l);
    if (!m) {
      kept.push(l);
      continue;
    }
    if (m[1] !== verdict2 && /^(PASS|REMEDIATION REQUIRED)$/.test(m[1])) throw new UsageError(`forge verdict: the body says "Verdict: ${m[1]}" but the flag is --${pass ? "pass" : "fail"}`);
  }
  return { verdict: verdict2, text: `${mark}
${kept.join("\n").trim()}

Verdict: ${verdict2}
` };
}
async function verdict(f, ctx, n, pass, body) {
  const b = ctx.binding;
  const cr = await f.view(n);
  const { text, verdict: v } = buildReport(body, cr.headSha, pass);
  const identity = !!b.forge.review_identity;
  if (identity) {
    const name = String(ctx.options.review_token_env ?? "");
    if (!name || !ctx.env[name]) throw new Error(`Access: the review token is not set (env var named by forge.options.review_token_env${name ? ` = ${name}` : ""}); nothing was posted`);
  }
  const comment = await f.comment(n, text);
  if (identity) {
    await f.status(cr.headSha, { context: reviewContext(b), state: pass ? "success" : "failure", description: `review: ${v}`, ...comment.url ? { url: comment.url } : {} });
    if (pass) await f.approve(n);
  }
  return { verdict: v, comment, status: identity ? "posted" : "ci" };
}
async function land(f, b, n, waitMinutes, classOf, step = 3e4) {
  const budget = (waitMinutes ?? b.cycle?.land_wait_minutes ?? 5) * 6e4;
  const required = b.forge.required_checks ?? [];
  for (let waited = 0; ; waited += step) {
    const cr = await f.view(n);
    if (cr.state === "merged") return { state: "merged", blocking: [] };
    if (cr.state === "closed") return { state: "blocked", blocking: [{ check: "change request", state: "closed" }] };
    if (cr.draft) return { state: "blocked", blocking: [{ check: "draft", state: "draft" }] };
    const state = (name) => cr.checks.find((c) => c.name === name)?.state ?? "missing";
    const rows = required.map((check) => ({ check, state: state(check) })).filter((r) => r.state !== "success");
    const red = rows.filter((r) => r.state === "failure");
    if (red.length) return { state: "blocked", blocking: red };
    if (!rows.length) {
      const after = await f.automerge(n);
      return { state: after.state === "merged" ? "merged" : "armed", blocking: [] };
    }
    if (rows.every((r) => r.check === HUMAN)) {
      const { class: klass, who } = await classOf(cr);
      return { state: "blocked", blocking: rows, needsHuman: { class: klass, who } };
    }
    if (waited + step > budget) return { state: "waiting", blocking: rows };
    await pause(step);
  }
}
function signalOfHead(cr, comments, b) {
  const trusted = trustedOf(b);
  const note = comments.filter((c) => trusted.has(c.author?.toLowerCase()) && isMarked(c.body, "note", cr.headSha)).sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt))[0];
  return note ? noteSignal(note.body) : void 0;
}
function nextAction(cr, comments, b, now, signalOpen = false) {
  const trusted = trustedOf(b);
  const mine = comments.filter((c) => trusted.has(c.author?.toLowerCase())).sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));
  const reports = mine.filter((c) => isMarked(c.body, "verdict"));
  const forHead = reports.find((c) => isMarked(c.body, "verdict", cr.headSha));
  const v = forHead ? verdictOf(forHead.body) : void 0;
  const head = v === "PASS" || v === "REMEDIATION REQUIRED" ? v : void 0;
  const reworks = reports.filter((c) => verdictOf(c.body) === "REMEDIATION REQUIRED").length + mine.filter((c) => isMarked(c.body, "note")).length;
  const times = [cr.pushedAt, mine[0]?.createdAt].filter((t) => !!t && !Number.isNaN(Date.parse(t)));
  const since = times.length ? new Date(Math.max(...times.map((t) => Date.parse(t)))).toISOString() : void 0;
  const gate = (name) => name === reviewContext(b) || name === HUMAN;
  const required = (b.forge.required_checks ?? []).filter((name) => !gate(name));
  const state = (name) => cr.checks.find((c) => c.name === name)?.state;
  const redCheck = required.find((name) => state(name) === "failure");
  const stuck = required.find((name) => {
    const s = state(name);
    return s === void 0 || s === "pending";
  });
  const stalled = !!stuck && !!cr.pushedAt && b.stall_minutes > 0 && now - Date.parse(cr.pushedAt) > b.stall_minutes * 6e4;
  const needsRework = head === "REMEDIATION REQUIRED" || !!redCheck;
  const cap = b.cycle?.max_rework ?? 3;
  let r;
  if (needsRework && !signalOpen && reworks >= cap) r = { action: "escalate", reason: "rework cap" };
  else if (stalled) r = { action: "escalate", reason: `required check ${stuck} is ${state(stuck) ?? "missing"} past stall_minutes` };
  else if (needsRework) r = signalOpen ? { action: "wait", reason: "a Signal named by the note is open" } : { action: "rework", reason: head === "REMEDIATION REQUIRED" ? "the review asks for remediation" : `required check ${redCheck} is red` };
  else if (cr.state === "open" && !head) r = { action: "review", reason: "no verdict for this head" };
  else if (cr.state === "open" && !cr.draft && cr.behind) r = { action: "sync", reason: "behind the trunk" };
  else if (cr.state === "open" && !cr.draft && head === "PASS") r = { action: "land", reason: "the review passed this head" };
  else r = { action: "wait", reason: "waiting on checks or approval" };
  return { ...r, reworks, ...since ? { since } : {} };
}
async function queue(f, b, classOf, now = Date.now(), signalOpen = async () => false, heldOf = async () => false) {
  const rows = [];
  for (const cr of await f.list({ state: "open", checks: true })) {
    const comments = await f.comments(cr.n);
    const sig = signalOfHead(cr, comments, b);
    const next = nextAction(cr, comments, b, now, sig ? await signalOpen(sig).catch(() => false) : false);
    const who = await classOf(cr).catch(() => ({ class: "guardrail", who: [] }));
    const held = cr.closes[0] ? await heldOf(cr.closes[0]).catch(() => false) : false;
    const approved = who.who.length > 0 && (b.forge.required_checks ?? []).includes(HUMAN) && cr.checks.some((c) => c.name === HUMAN && c.state === "success");
    rows.push({
      n: cr.n,
      ...cr.closes[0] ? { ticket: cr.closes[0] } : {},
      class: who.class,
      action: next.action,
      reason: next.reason,
      reworks: next.reworks,
      ...next.since ? { since: next.since } : {},
      held,
      ...held && next.action === "land" && approved ? { release: true } : {}
    });
  }
  return rows;
}
var HUMAN, reviewContext, trustedOf, noteSignal;
var init_flow = __esm({
  "src/forge/flow.ts"() {
    "use strict";
    init_ports();
    init_comments();
    init_exec();
    init_util();
    HUMAN = "human-approval";
    reviewContext = (b) => b.forge.review_check_name ?? "review";
    trustedOf = (b) => {
      const o = ownersFor(b.owners, "forge");
      return new Set([...o.bots, ...o.product, ...o.factory, ...o.operator, ...o.security, ...o.compliance, b.forge.review_identity].filter(Boolean).map((x) => x.toLowerCase()));
    };
    noteSignal = (body) => /^<!-- note \S+ ([^\s>]+) -->/.exec(body)?.[1] ?? /\bSignal[ \t]*[:#]?[ \t]*#?([A-Za-z][A-Za-z0-9]*-\d+|\d+)\b/i.exec(body)?.[1];
  }
});

// src/forge/github.ts
function github(ctx) {
  const repo = ctx.options.repo;
  const api = `repos/${repo ?? "{owner}/{repo}"}`;
  const num = (n) => {
    if (!/^\d+$/.test(String(n))) throw new Error(`forge: not a change request number: ${n}`);
    return String(n);
  };
  const hex = (sha2) => {
    if (!/^[0-9a-f]{7,40}$/i.test(String(sha2))) throw new Error(`forge: not a commit sha: ${sha2}`);
    return String(sha2);
  };
  const withToken = (key) => ({ ...ctx.env, GH_TOKEN: secret(ctx, key) });
  const implementer = () => {
    const name = ctx.options.token_env;
    if (!name || !ctx.env[name] && ctx.env.CLAUDE_CODE_REMOTE === "true") return void 0;
    return withToken("token_env");
  };
  const gh = (a, input, env = implementer()) => ghRetry(ctx.exec, repo && a[0] !== "api" ? [...a, "-R", repo] : a, { cwd: ctx.root, input, env });
  const post2 = async (path, data, env) => JSON.parse(await gh(["api", "-X", "POST", `${api}/${path}`, "--input", "-"], JSON.stringify(data), env));
  const cloud = ctx.env.CLAUDE_CODE_REMOTE === "true";
  const oneIdentity = !ctx.binding.forge.review_identity;
  const lines = (out) => out.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const ccr = (method, n, route, ...f) => gh(["api", "-X", method, `${api}/pulls/${n}/ccr/${route}`, ...f]);
  const labelled = (p) => (p.labels ?? []).some((l) => l.name === "draft");
  const label = (n) => post2(`issues/${n}/labels`, { labels: ["draft"] });
  const view = async (n) => {
    n = num(n);
    const p = JSON.parse(await gh(["api", `${api}/pulls/${n}`]));
    const runs = lines(await gh(["api", "--paginate", `${api}/commits/${p.head.sha}/check-runs?per_page=100`, "--jq", ".check_runs[]"]));
    const statuses = lines(await gh(["api", "--paginate", `${api}/commits/${p.head.sha}/status?per_page=100`, "--jq", ".statuses[]"]));
    let pushedAt;
    try {
      pushedAt = (await gh(["api", `${api}/commits/${p.head.sha}/check-suites`, "--jq", "[.check_suites[].created_at] | min // empty"])).trim() || void 0;
    } catch {
    }
    if (pushedAt && Number.isNaN(Date.parse(pushedAt))) pushedAt = void 0;
    return {
      n: String(p.number),
      url: p.html_url,
      title: p.title,
      source: p.head.ref,
      target: p.base.ref,
      headSha: p.head.sha,
      baseSha: p.base.sha,
      draft: !!p.draft || labelled(p),
      state: p.merged_at ? "merged" : p.state === "open" ? "open" : "closed",
      behind: p.mergeable_state === "behind",
      mergeSha: p.merged_at ? p.merge_commit_sha : void 0,
      closes: parseCloses(p.body ?? ""),
      checks: [
        // A re-run adds a check run with the same name: only the newest (highest id) counts.
        ...Object.values(Object.fromEntries([...runs].sort((x, y) => x.id - y.id).map((c) => [c.name, c]))).map((c) => ({ name: c.name, state: runState(c) })),
        ...statuses.map((s) => ({ name: s.context, state: statusState(s) }))
      ],
      body: p.body ?? "",
      author: p.user?.login ?? "",
      ...pushedAt ? { pushedAt } : {}
    };
  };
  const fromRow = (p) => ({
    n: String(p.number),
    url: p.html_url,
    title: p.title,
    source: p.head.ref,
    target: p.base.ref,
    headSha: p.head.sha,
    baseSha: p.base.sha,
    draft: !!p.draft || labelled(p),
    state: p.merged_at ? "merged" : p.state === "open" ? "open" : "closed",
    behind: false,
    mergeSha: p.merged_at ? p.merge_commit_sha : void 0,
    closes: parseCloses(p.body ?? ""),
    checks: [],
    body: p.body ?? "",
    author: p.user?.login ?? ""
  });
  return {
    async open(o) {
      const pr = { head: o.source, base: ctx.binding.vcs.trunk, title: o.title, body: o.body };
      let n;
      try {
        n = String((await post2("pulls", { ...pr, draft: !!o.draft })).number);
      } catch (e) {
        if (!o.draft || !/draft pull requests are not supported/i.test(e.message)) throw e;
        n = String((await post2("pulls", pr)).number);
        await label(n);
      }
      return view(n);
    },
    view,
    async viewBySha(sha2) {
      const ps = JSON.parse(await gh(["api", `${api}/commits/${hex(sha2)}/pulls`]));
      if (!ps.length) throw new Error(`no change request for ${sha2}`);
      const is = (a) => !!a && a.toLowerCase() === sha2.toLowerCase();
      const hit = ps.find((p) => is(p.merge_commit_sha)) ?? ps.find((p) => is(p.head?.sha)) ?? ps[0];
      return view(String(hit.number));
    },
    async diff(n) {
      n = num(n);
      return gh(["api", `${api}/pulls/${n}`, "-H", "Accept: application/vnd.github.diff"]);
    },
    async list(q = {}) {
      const state = q.state === "merged" ? "closed" : q.state ?? "open";
      const since = q.since ? Date.parse(q.since) : void 0;
      const at = (p) => Date.parse(q.state === "merged" ? p.merged_at : p.updated_at);
      const keep = (p) => (q.state !== "merged" || p.merged_at) && (since === void 0 || at(p) >= since);
      let rows;
      if (q.limit === void 0 && since === void 0) {
        rows = JSON.parse(await gh(["api", `${api}/pulls?state=${state}&per_page=100`, "--paginate", "--slurp"])).flat().filter(keep);
      } else {
        rows = [];
        for (let page = 1; ; page++) {
          const r = JSON.parse(await gh(["api", `${api}/pulls?state=${state}&sort=updated&direction=desc&per_page=100&page=${page}`]));
          rows.push(...r.filter(keep));
          if (r.length < 100 || q.limit !== void 0 && rows.length >= q.limit) break;
          if (since !== void 0 && Date.parse(r[r.length - 1].updated_at) < since) break;
        }
        if (q.limit !== void 0) rows = rows.slice(0, q.limit);
      }
      return Promise.all(rows.map((p) => q.checks ? view(String(p.number)) : fromRow(p)));
    },
    async closing(id) {
      const q = `repo:${repo ?? "{owner}/{repo}"} is:pr is:merged "Closes ${id}" OR "Closes #${id}" in:body`;
      const rows = JSON.parse(await gh(["api", "-X", "GET", "search/issues", "-F", `q=${q}`, "-F", "per_page=30"])).items ?? [];
      return (await Promise.all(rows.map((r) => view(String(r.number))))).filter((c) => c.closes.includes(id));
    },
    async ready(n) {
      n = num(n);
      if (labelled(JSON.parse(await gh(["api", `${api}/pulls/${n}`])))) await gh(["api", "-X", "DELETE", `${api}/issues/${n}/labels/draft`]);
      else if (cloud) await ccr("POST", n, "ready_for_review");
      else await gh(["pr", "ready", n]);
      return view(n);
    },
    async draft(n) {
      n = num(n);
      try {
        if (cloud) await ccr("POST", n, "convert_to_draft");
        else await gh(["pr", "ready", n, "--undo"]);
      } catch {
        await label(n);
      }
      return view(n);
    },
    async sync(n) {
      n = num(n);
      await gh(["api", "-X", "PUT", `${api}/pulls/${n}/update-branch`]);
      return view(n);
    },
    async automerge(n) {
      n = num(n);
      try {
        if (cloud) await ccr("PUT", n, "auto_merge", "-f", "merge_method=squash");
        else await gh(["pr", "merge", n, "--auto", "--squash"]);
      } catch (e) {
        const cr = await view(n);
        const green = (r) => cr.checks.some((c) => c.name === r && c.state === "success");
        if (cr.draft || !(ctx.binding.forge.required_checks ?? []).every(green)) throw e;
        await gh(["api", "-X", "PUT", `${api}/pulls/${n}/merge`, "-f", "merge_method=squash", "-f", `sha=${cr.headSha}`]);
      }
      return view(n);
    },
    async cut(revision, version3) {
      const list = async () => JSON.parse(await gh(["run", "list", "--workflow", "agentic-sdlc-release.yml", "--event", "workflow_dispatch", "-L", "5", "--json", "databaseId,url"]) || "[]");
      const before = Math.max(0, ...(await list()).map((r) => r.databaseId));
      await gh(["workflow", "run", "agentic-sdlc-release.yml", "-f", `revision=${revision}`, "-f", `version=${version3}`]);
      for (let i = 0; i < 10; i++) {
        const run = (await list()).filter((r) => r.databaseId > before).sort((a, b) => a.databaseId - b.databaseId)[0];
        if (run) return { requested: true, run: String(run.databaseId), url: run.url };
        if (i < 9) await new Promise((r) => setTimeout(r, 2e3));
      }
      return { requested: true };
    },
    async comment(n, body) {
      n = num(n);
      const c = await post2(`issues/${n}/comments`, { body });
      return { id: String(c.id), url: c.html_url };
    },
    async comments(n) {
      n = num(n);
      const out = await gh(["api", "--paginate", `${api}/issues/${n}/comments`, "--jq", ".[] | {id: (.id | tostring), author: .user.login, createdAt: .created_at, body: .body, url: .html_url}"]);
      return out.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    },
    async status(sha2, s, opts) {
      hex(sha2);
      const a = ["api", "-X", "POST", `${api}/statuses/${sha2}`, "-f", `state=${s.state}`, "-f", `context=${s.context}`, "-f", `description=${s.description}`];
      if (s.url) a.push("-f", `target_url=${s.url}`);
      await gh(a, void 0, opts?.as === "ci" || oneIdentity ? implementer() : withToken("review_token_env"));
    },
    async approve(n) {
      n = num(n);
      if (oneIdentity) throw new Error("one identity (forge.review_identity is empty): GitHub refuses an approving review from the CR's author; the review step skips forge approve");
      await post2(`pulls/${n}/reviews`, { event: "APPROVE", body: "agentic-sdlc review: PASS" }, withToken("review_token_env"));
    },
    async approvals(n) {
      n = num(n);
      const out = await gh(["api", "--paginate", `${api}/pulls/${n}/reviews`, "--jq", ".[] | {user: .user.login, state: (.state | ascii_downcase), sha: .commit_id, assoc: .author_association}"]);
      return out.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    },
    async commits(n) {
      n = num(n);
      const out = await gh(["api", "--paginate", `${api}/pulls/${n}/commits?per_page=100`, "--jq", '.[] | {sha: .sha, message: .commit.message, author: (.author.login // ""), committer: (.committer.login // ""), authorName: (.commit.author.name // ""), committerName: (.commit.committer.name // ""), committerEmail: (.commit.committer.email // ""), parents: (.parents | length)}']);
      const rows = out.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
      if (rows.length >= 250) throw new Error(`forge: CR ${n} has ${rows.length} or more commits; the forge lists at most 250`);
      return rows;
    },
    async runs(q = {}) {
      const a = ["run", "list", "--limit", "30", "--json", RUN_FIELDS];
      if (q.ref) a.push("--branch", q.ref);
      if (q.failed) a.push("--status", "failure");
      return JSON.parse(await gh(a)).map(runOf);
    },
    async run(id) {
      if (!/^\d+$/.test(String(id))) throw new Error(`forge: not a run id: ${id}`);
      return runOf(JSON.parse(await gh(["run", "view", String(id), "--json", RUN_FIELDS])));
    }
  };
}
var runState, runOf, RUN_FIELDS, statusState;
var init_github2 = __esm({
  "src/forge/github.ts"() {
    "use strict";
    init_ports();
    init_exec();
    init_util();
    runState = (c) => c.status !== "completed" ? "pending" : ["success", "neutral", "skipped"].includes(c.conclusion) ? "success" : "failure";
    runOf = (r) => ({
      id: String(r.databaseId),
      name: r.name,
      ref: r.headBranch,
      sha: r.headSha,
      url: r.url,
      at: r.createdAt,
      state: r.status !== "completed" ? "pending" : r.conclusion === "success" ? "success" : "failure"
    });
    RUN_FIELDS = "databaseId,name,headBranch,headSha,status,conclusion,url,createdAt";
    statusState = (s) => s.state === "success" || s.state === "pending" ? s.state : "failure";
  }
});

// src/skills.ts
import { createHash } from "crypto";
import { existsSync as existsSync2, readdirSync, readFileSync as readFileSync4 } from "fs";
import { join as join3, relative } from "path";
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!m) return void 0;
  try {
    const fm = (0, import_yaml2.parse)(m[1]);
    return fm && typeof fm === "object" && !Array.isArray(fm) ? { fm, body: m[2].replace(/\r\n/g, "\n") } : void 0;
  } catch {
    return void 0;
  }
}
function hashSkill(dir) {
  const h = createHash("sha256");
  const files = readdirSync(dir, { recursive: true, withFileTypes: true }).filter((d) => d.isFile()).map((d) => join3(d.parentPath, d.name)).map((p) => [relative(dir, p).replaceAll("\\", "/"), p]).sort(([a], [b]) => a < b ? -1 : 1);
  for (const [rel, p] of files) h.update(`${rel}\0${readFileSync4(p, "utf8").replace(/\r\n/g, "\n")}\0`);
  return h.digest("hex").slice(0, 12);
}
function readSkills(dir) {
  const pack = { skills: [], steps: [], errors: [], warnings: [] };
  if (!existsSync2(dir)) {
    pack.errors.push(`${dir} does not exist`);
    return pack;
  }
  const { errors, warnings } = pack;
  for (const e of readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory()).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const d = join3(dir, e.name), file = join3(d, "SKILL.md");
    if (!existsSync2(file)) {
      errors.push(`${e.name}: SKILL.md missing`);
      continue;
    }
    const fm = frontmatter(readFileSync4(file, "utf8"))?.fm;
    if (!fm) {
      errors.push(`${e.name}: no frontmatter`);
      continue;
    }
    for (const k of ["name", "description"]) if (typeof fm[k] !== "string" || !fm[k].trim()) errors.push(`${e.name}: frontmatter ${k} missing`);
    if (typeof fm.name === "string" && fm.name && fm.name !== e.name) errors.push(`${e.name}: frontmatter name '${fm.name}' differs from the folder name`);
    const skill = logicalName(e.name);
    const hash = hashSkill(d);
    const steps = [];
    const meta = fm.metadata && typeof fm.metadata === "object" ? fm.metadata : {};
    const tierOk = (label, tier) => {
      if (tier === void 0 || tier === null || tier === "") {
        errors.push(`${e.name}: frontmatter ${label} missing`);
        return false;
      }
      if (!TIER_NAMES.includes(tier)) {
        errors.push(`${e.name}: tier ${tier} invalid (${label})`);
        return false;
      }
      return true;
    };
    if (meta.steps !== void 0) {
      if (meta.tier !== void 0) errors.push(`${e.name}: metadata.steps and metadata.tier are both set; a skill with steps has no tier of its own`);
      const decl = meta.steps;
      if (!decl || typeof decl !== "object" || Array.isArray(decl) || !Object.keys(decl).length) errors.push(`${e.name}: metadata.steps must be { <step>: { tier } }`);
      else {
        for (const [step, def] of Object.entries(decl)) {
          if (!STEP_NAME.test(step)) {
            errors.push(`${e.name}: step name '${step}' is not lower-case words with hyphens`);
            continue;
          }
          const stepFile2 = join3(d, "steps", `${step}.md`);
          if (!existsSync2(stepFile2)) errors.push(`${e.name}: step ${step} has no file steps/${step}.md`);
          if (!tierOk(`metadata.steps.${step}.tier`, def?.tier) || !existsSync2(stepFile2)) continue;
          steps.push({ skill, step, id: `${skill}/${step}`, tier: def.tier, file: stepFile2, dir: d, hash });
        }
        const sdir = join3(d, "steps");
        if (existsSync2(sdir)) {
          for (const n of readdirSync(sdir).filter((x) => x.endsWith(".md")))
            if (!Object.hasOwn(decl ?? {}, n.slice(0, -3))) errors.push(`${e.name}: steps/${n} is not in metadata.steps`);
        }
      }
    } else {
      let tier = meta.tier;
      if (tier === void 0 && fm.tier !== void 0) {
        tier = fm.tier;
        warnings.push(`${e.name}: top-level tier is deprecated; move it to metadata.tier`);
      }
      if (tier === void 0) errors.push(`${e.name}: frontmatter metadata.tier or metadata.steps missing`);
      else if (tierOk("metadata.tier", tier)) steps.push({ skill, id: skill, tier, file, dir: d, hash });
    }
    pack.skills.push({ skill, name: e.name, dir: d, file, steps });
    pack.steps.push(...steps);
  }
  return pack;
}
function forbiddenHits(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((l, i) => {
    for (const { re, reason } of FORBIDDEN) {
      const m = re.exec(l);
      if (m) hits.push({ line: i + 1, match: m[0], reason });
    }
  });
  return hits;
}
var import_yaml2, TIER_NAMES, OLD_STEP_IDS, stepIdOf, skillOf, logicalName, STEP_NAME, findStep, scorerTargets, FORBIDDEN;
var init_skills = __esm({
  "src/skills.ts"() {
    "use strict";
    import_yaml2 = __toESM(require_dist(), 1);
    TIER_NAMES = ["fast", "balanced", "deep"];
    OLD_STEP_IDS = {
      "implement-spec": "build",
      "review-pr": "review/review",
      shape: "plan/shape",
      "triage-signal": "plan/triage",
      "backlog-grooming": "plan/groom",
      "verify-ux": "review/verify",
      release: "ship",
      "judge-run": "learn/judge",
      "improve-factory": "learn/improve",
      "escalate-to-human": "escalate"
    };
    stepIdOf = (name) => Object.hasOwn(OLD_STEP_IDS, name) ? OLD_STEP_IDS[name] : name;
    skillOf = (id) => id.split("/")[0];
    logicalName = (folder) => folder.replace(/^sdlc-(?=.)/, "");
    STEP_NAME = /^[a-z][a-z0-9-]*$/;
    findStep = (pack, id) => pack.steps.find((s) => s.id === id);
    scorerTargets = (pack) => /* @__PURE__ */ new Set([...pack.steps.map((s) => s.id), ...pack.skills.map((s) => s.skill)]);
    FORBIDDEN = [
      { re: /\bidentit(?:y|ies)\b/i, reason: "one or two forge identities is a setup fact: the CLI decides it from the binding" },
      { re: /\breview[ -]tokens?\b|\breview_token_env\b/i, reason: "the review token is a setup fact: the CLI decides it" },
      { re: /\breview[ -]runtimes?\b|\breview_identity\b/i, reason: "where a review runs is a setup fact: dispatch decides it" },
      { re: /\b(?:Claude|Codex|Cursor|Gemini|Antigravity)\b/, reason: "a skill works in any harness: name no harness" },
      { re: /\bplugins?\b|\bsub-?agents?\b|\bMCP\b/i, reason: "a skill names no harness mechanism (plugin, subagent, MCP)" },
      { re: /\bGitHub\b|\bGitLab\b|\bBitbucket\b|\bgh\b/i, reason: "a skill works on any forge: it calls `agentic-sdlc forge <verb>`" },
      { re: /\bpull[ -]requests?\b/i, reason: "the word is change request" },
      { re: /\bnpm\b|\bnpx\b|\bnode\b|\bpnpm\b|\byarn\b/i, reason: "a skill names no package manager or runtime; commands come from the binding" },
      { re: /\bcloud sessions?\b/i, reason: "a skill works in any runtime" },
      { re: /\bHTTP\b|\b(?:status|code|error|answer)s? (?:4\d\d|5\d\d)\b|\b(?:4\d\d|5\d\d) (?:error|status)\b/i, reason: "a skill reads the CLI result, never an HTTP status" },
      { re: /\b(?:glab|jira|aws|gcloud|az|kubectl|docker|terraform|vercel|netlify)\b/i, reason: "a skill calls no vendor CLI" },
      { re: /`Required`|(?<!agentic-sdlc gate )\b(?:proofs-on-base|agent-provenance|human-approval|evidence-check|signal-on-red)\b/, reason: "check names come from the binding or the CLI output, never from a skill" },
      { re: /\bDORA\b/, reason: "a measure is named by what it counts" },
      { re: /\b(?:GDPR|HIPAA|SOX|CCPA|FedRAMP|PCI-DSS|SOC ?2|ISO ?27001)\b/, reason: "a skill names no law or standard; the binding names the product's" }
    ];
  }
});

// src/telemetry.ts
import { createHash as createHash2 } from "crypto";
function otlpTraces(rows, meta, o) {
  const cycles = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const m = meta.get(r.id) ?? { key: r.at, at: r.at, kind: "cycle" };
    const c = cycles.get(m.key) ?? { m, rows: [] };
    c.rows.push(r);
    cycles.set(m.key, c);
  }
  const spans = [...cycles.values()].sort((a, b) => a.m.at < b.m.at ? -1 : a.m.at > b.m.at ? 1 : a.m.key < b.m.key ? -1 : 1).flatMap(({ m, rows: rs }) => {
    const trace = traceId(m.key);
    const root = spanId(`cycle:${m.key}`);
    rs = [...rs].sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1);
    const times = rs.map((r) => {
      const end = Date.parse(r.at);
      return { start: end - (r.minutes ?? 0) * 6e4, end };
    });
    const cycleEnd = Math.max(Date.parse(m.at), ...times.map((t) => t.end));
    const cycleStart = Math.min(cycleEnd, ...times.map((t) => t.start));
    const out = [{
      traceId: trace,
      spanId: root,
      name: `${GENAI.op.workflow} sdlc`,
      kind: SPAN_KIND_INTERNAL,
      startTimeUnixNano: nano(cycleStart),
      endTimeUnixNano: nano(cycleEnd),
      attributes: attrs({ [GENAI.attr.operation]: GENAI.op.workflow, [GENAI.attr.agentName]: "sdlc", [`${NS}.cycle.kind`]: m.kind, [`${NS}.factory`]: m.factory })
    }];
    rs.forEach((r, i) => {
      const { start, end } = times[i];
      const failed = r.outcome !== "done";
      const scores = Object.entries(r.scores ?? {});
      out.push({
        traceId: trace,
        spanId: spanId(`run:${r.id}`),
        parentSpanId: root,
        name: `${GENAI.op.agent} ${r.skill}`,
        kind: SPAN_KIND_INTERNAL,
        startTimeUnixNano: nano(start),
        endTimeUnixNano: nano(end),
        attributes: attrs({
          [GENAI.attr.operation]: GENAI.op.agent,
          [GENAI.attr.agentName]: r.skill,
          [GENAI.attr.agentVersion]: r.skillHash,
          [GENAI.attr.requestModel]: r.model,
          ...failed ? { [GENAI.attr.errorType]: r.outcome } : {},
          [`${NS}.run.id`]: r.id,
          [`${NS}.ticket`]: r.ticket,
          [`${NS}.cr`]: r.cr,
          [`${NS}.tier`]: r.tier,
          [`${NS}.executor`]: r.executor ?? "harness",
          [`${NS}.ref`]: r.ref,
          [`${NS}.tokens`]: r.tokens,
          [`${NS}.minutes`]: r.minutes,
          [`${NS}.outcome`]: r.outcome,
          [`${NS}.score`]: r.score,
          [`${NS}.trace`]: r.trace
        }),
        ...scores.length ? { events: scores.map(([name, v]) => ({
          timeUnixNano: nano(end),
          name: GENAI.event.evaluation,
          attributes: attrs({ [GENAI.evalAttr.name]: name, ...typeof v === "number" ? { [GENAI.evalAttr.value]: v } : { [GENAI.evalAttr.label]: v } })
        })) } : {},
        ...failed ? { status: { code: STATUS_ERROR, ...r.error ? { message: r.error.slice(0, 200) } : {} } } : {}
      });
    });
    return out;
  });
  return {
    resourceSpans: [{
      resource: { attributes: attrs({ "service.name": SCOPE_NAME, "service.version": o.version, [`${NS}.repo`]: o.repo }) },
      scopeSpans: [{ scope: { name: SCOPE_NAME, version: o.version }, schemaUrl: GENAI.schemaUrl, spans }]
    }]
  };
}
function cdEventsFromRuns(rows, meta, b) {
  const repo = repoRef(b);
  const sorted = [...rows].sort((a, z) => a.at < z.at ? -1 : a.at > z.at ? 1 : a.id < z.id ? -1 : 1);
  const out = [];
  const created = /* @__PURE__ */ new Set();
  for (const r of sorted) {
    const cycle = meta.get(r.id)?.key;
    out.push(cd(b, CDEVENTS.type.taskrunFinished, r.id, r.at, r.id, {
      taskName: r.skill,
      outcome: cdOutcome(r.outcome),
      ...r.outcome !== "done" && r.error ? { errors: r.error } : {},
      ...cycle ? { pipelineRun: { id: cycle } } : {}
    }));
    if (!r.cr) continue;
    if (stepIdOf(r.skill) === "build" && !created.has(r.cr)) {
      created.add(r.cr);
      out.push(cd(b, CDEVENTS.type.changeCreated, r.cr, r.at, r.id, { ...repo ? { repository: repo } : {} }));
    }
    if (stepIdOf(r.skill) === "review/review" && r.outcome === "done") out.push(cd(b, CDEVENTS.type.changeReviewed, r.cr, r.at, r.id, { ...repo ? { repository: repo } : {} }));
  }
  return out;
}
function deployEvent(b, o) {
  if (o.result !== "success" && o.result !== "rolled-back") return { skip: `a ${o.result} deploy has no CDEvents event` };
  const repo = repoOf(b);
  if (!repo) return { skip: "forge.options.repo is unset: the deployed service and artifact have no name" };
  const type = o.result === "success" ? CDEVENTS.type.serviceDeployed : CDEVENTS.type.serviceRolledback;
  return cd(b, type, `service/${repo.split("/").pop()}`, o.at ?? Date.now(), `${o.env}\0${o.sha}\0${o.version ?? ""}`, {
    environment: { id: o.env },
    artifactId: `pkg:generic/${repo}@${encodeURIComponent(o.version ?? o.sha)}`
  });
}
function parseHeaders(s) {
  const out = {};
  for (const part of s.split(",")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
function sinkOf(b, env, kind) {
  const t = b.telemetry;
  const name = kind === "otlp" ? t?.otlp_endpoint_env : t?.cdevents_sink_env;
  if (!name) return void 0;
  const url = env[name];
  if (!url) throw new Error(`telemetry: env var ${name} is empty`);
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`telemetry: env var ${name} is not a valid http(s) URL`);
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error(`telemetry: env var ${name} is not a valid http(s) URL`);
  if (u.username || u.password) throw new Error(`telemetry: env var ${name} must not hold credentials in the URL: use the headers variable`);
  const h = t?.headers_env ? env[t.headers_env] : void 0;
  return { url: kind === "otlp" ? `${url.replace(/\/+$/, "")}/v1/traces` : url, headers: h ? parseHeaders(h) : {} };
}
async function sendOtlp(ctx, doc) {
  const s = sinkOf(ctx.binding, ctx.env, "otlp");
  if (!s) throw new Error("telemetry.otlp_endpoint_env is unset in the binding: nothing to send to");
  const r = await ctx.http("POST", s.url, { headers: s.headers, body: doc });
  const n = Number(r?.partialSuccess?.rejectedSpans ?? 0);
  if (n > 0) throw new Error(`the OTLP endpoint rejected ${n} span(s): ${String(r.partialSuccess.errorMessage ?? "").slice(0, 200)}`);
}
async function sendCdEvent(ctx, ev, send = {}) {
  const s = sinkOf(ctx.binding, ctx.env, "cdevents");
  if (!s) throw new Error("telemetry.cdevents_sink_env is unset in the binding: nothing to send to");
  const c = ev.context;
  const headers = { "ce-specversion": "1.0", "ce-id": c.id, "ce-source": c.source, "ce-type": c.type, "ce-time": c.timestamp, "ce-subject": ev.subject.id, ...s.headers };
  await ctx.http("POST", s.url, { headers, body: ev, ...send });
}
async function emitGateEvent(ctx, ev, warn = (l) => process.stderr.write(`${l}
`), deadlineMs = GATE_TELEMETRY_DEADLINE_MS) {
  let timer;
  try {
    const name = ctx.binding.telemetry?.cdevents_sink_env;
    if (!name) return false;
    if ("skip" in ev) {
      warn(`telemetry: CDEvent not sent: ${ev.skip}`);
      return false;
    }
    const late = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error(`no answer within ${deadlineMs} ms`)), deadlineMs);
    });
    await Promise.race([sendCdEvent(ctx, ev, { tries: 1, timeoutMs: deadlineMs }), late]);
    return true;
  } catch (e) {
    const name = ctx.binding.telemetry?.cdevents_sink_env;
    warn(`telemetry: CDEvent not sent: ${scrubUrl(e.message.split("\n")[0], name ? ctx.env[name] : void 0).slice(0, 200)}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
var GENAI, NS, SCOPE_NAME, SPAN_KIND_INTERNAL, STATUS_ERROR, CDEVENTS, sha256, traceId, spanId, anyValue, attrs, nano, repoOf, repoRef, sourceOf, iso, cd, cdOutcome, changeMergedEvent, GATE_TELEMETRY_DEADLINE_MS;
var init_telemetry = __esm({
  "src/telemetry.ts"() {
    "use strict";
    init_skills();
    init_exec();
    GENAI = {
      schemaUrl: "https://opentelemetry.io/schemas/gen-ai-dev/1.42.0-dev",
      stability: "development",
      attr: {
        operation: "gen_ai.operation.name",
        agentName: "gen_ai.agent.name",
        agentVersion: "gen_ai.agent.version",
        requestModel: "gen_ai.request.model",
        errorType: "error.type"
      },
      op: { agent: "invoke_agent", workflow: "invoke_workflow" },
      event: { evaluation: "gen_ai.evaluation.result" },
      evalAttr: { name: "gen_ai.evaluation.name", value: "gen_ai.evaluation.score.value", label: "gen_ai.evaluation.score.label" }
    };
    NS = "agentic_sdlc";
    SCOPE_NAME = "agentic-sdlc";
    SPAN_KIND_INTERNAL = 1;
    STATUS_ERROR = 2;
    CDEVENTS = {
      specversion: "0.5.1",
      type: {
        changeCreated: "dev.cdevents.change.created.0.4.0",
        changeReviewed: "dev.cdevents.change.reviewed.0.3.0",
        changeMerged: "dev.cdevents.change.merged.0.3.0",
        serviceDeployed: "dev.cdevents.service.deployed.0.3.0",
        serviceRolledback: "dev.cdevents.service.rolledback.0.3.0",
        taskrunFinished: "dev.cdevents.taskrun.finished.0.3.0"
      }
    };
    sha256 = (s) => createHash2("sha256").update(s).digest("hex");
    traceId = (cycleKey) => sha256(`${NS}:trace:${cycleKey}`).slice(0, 32);
    spanId = (key) => sha256(`${NS}:span:${key}`).slice(0, 16);
    anyValue = (v) => typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { boolValue: v } : Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
    attrs = (o) => Object.entries(o).filter(([, v]) => v !== void 0 && v !== null && v !== "").map(([key, v]) => ({ key, value: anyValue(v) }));
    nano = (ms) => `${BigInt(Math.round(ms)) * 1000000n}`;
    repoOf = (b) => {
      const r = b.forge?.options?.repo;
      return typeof r === "string" && r ? r : void 0;
    };
    repoRef = (b) => {
      const id = repoOf(b);
      return id ? { id, ...b.forge?.adapter === "github" ? { source: `https://github.com/${id}` } : {} } : void 0;
    };
    sourceOf = (b) => repoRef(b)?.source ?? repoOf(b) ?? SCOPE_NAME;
    iso = (t) => new Date(t).toISOString();
    cd = (b, type, subject2, at, discriminator, content) => ({
      context: { specversion: CDEVENTS.specversion, id: sha256(`${type}\0${subject2}\0${discriminator}`).slice(0, 32), source: sourceOf(b), type, timestamp: iso(at) },
      subject: { id: subject2, content }
    });
    cdOutcome = (o) => o === "done" ? "success" : o === "timeout" || o === "capped" ? "cancel" : "failure";
    changeMergedEvent = (b, o) => cd(b, CDEVENTS.type.changeMerged, o.cr, o.at ?? Date.now(), o.sha, { ...repoRef(b) ? { repository: repoRef(b) } : {} });
    GATE_TELEMETRY_DEADLINE_MS = 5e3;
  }
});

// src/ledger.ts
var ledger_exports = {};
__export(ledger_exports, {
  GRADE_MARKER: () => GRADE_MARKER,
  HEARTBEAT_MARKER: () => HEARTBEAT_MARKER,
  OPTIONS: () => OPTIONS2,
  SCORES_MARKER: () => SCORES_MARKER,
  SCORE_SCORER: () => SCORE_SCORER,
  byScorer: () => byScorer,
  changeFailures: () => changeFailures,
  cli: () => cli2,
  clusters: () => clusters,
  cycleMeta: () => cycleMeta,
  exportRows: () => exportRows,
  flattenRuns: () => flattenRuns,
  hardFacts: () => hardFacts,
  hashSkill: () => hashSkill,
  isFail: () => isFail,
  learningState: () => learningState,
  measures: () => measures,
  median: () => median,
  normaliseError: () => normaliseError,
  parseGrades: () => parseGrades,
  parseHeartbeat: () => parseHeartbeat,
  parseScores: () => parseScores,
  pickRescores: () => pickRescores,
  plan: () => plan,
  readLedger: () => readLedger,
  readRuns: () => readRuns,
  scorersFor: () => scorersFor,
  scoresComment: () => scoresComment,
  sinceMs: () => sinceMs,
  stats: () => stats,
  summarise: () => summarise,
  ticketUse: () => ticketUse
});
import { existsSync as existsSync3, readdirSync as readdirSync2, readFileSync as readFileSync5, writeFileSync as writeFileSync2 } from "fs";
import { join as join4, relative as relative2, resolve } from "path";
import { parseArgs as parseArgs2 } from "util";
function parseHeartbeat(body) {
  const lines = body.trimStart().split(/\r?\n/);
  while (lines.length && lines[0].startsWith("<!-- agentic-sdlc:")) lines.shift();
  body = lines.join("\n");
  if (!body.trimStart().startsWith(HEARTBEAT_MARKER)) return void 0;
  const m = body.match(/```json\s*\r?\n([\s\S]*?)\r?\n```/);
  try {
    return JSON.parse(m ? m[1] : body.split(/\r?\n/).slice(1).join("\n"));
  } catch {
    return void 0;
  }
}
function pickRescores(rescores) {
  const won = /* @__PURE__ */ new Map();
  for (const r of rescores) {
    const k = `${r.id}\0${r.scorer ?? SCORE_SCORER}`;
    const prev = won.get(k);
    if (!prev || r.by === "human" && prev.by !== "human") won.set(k, r);
  }
  const out = /* @__PURE__ */ new Map();
  for (const r of won.values()) out.set(r.id, (out.get(r.id) ?? /* @__PURE__ */ new Map()).set(r.scorer ?? SCORE_SCORER, r.score));
  return out;
}
function applyRescores(r, m) {
  if (!m) return r;
  if (m.get(SCORE_SCORER) === "unscorable" && hardFacts(r)) {
    m = new Map(m);
    m.delete(SCORE_SCORER);
  }
  const s = m.get(SCORE_SCORER);
  const { score: _old, ...rest } = r;
  return { ...s === "unscorable" ? rest : r, scores: { ...r.scores, ...Object.fromEntries(m) }, ...typeof s === "number" ? { score: s } : {} };
}
function parseScores(body) {
  if (!body.trimStart().startsWith(SCORES_MARKER)) return [];
  const m = body.match(/```json\s*\r?\n([\s\S]*?)\r?\n```/);
  let s;
  try {
    s = JSON.parse(m?.[1] ?? "");
  } catch {
    return [];
  }
  if (typeof s?.run !== "string" || !s.scores || typeof s.scores !== "object") return [];
  return Object.entries(s.scores).map(([scorer, score]) => ({ id: s.run, scorer, score, by: "judge", ...scorer === SCORE_SCORER && s.cap ? { cap: s.cap } : {} }));
}
function flattenRuns(comments, q = {}) {
  const want = q.skill === void 0 ? void 0 : stepIdOf(q.skill);
  const cutoff = q.sinceDays === void 0 ? -Infinity : (q.now ?? Date.now()) - q.sinceDays * 864e5;
  const beats = comments.map((c) => ({ c, hb: parseHeartbeat(c.body) })).filter((x) => x.hb);
  const rescore = pickRescores(comments.flatMap((c) => {
    const hb = parseHeartbeat(c.body);
    return hb ? hb.rescores ?? [] : isScores(c) ? parseScores(c.body) : parseGrades(c.body);
  }));
  return beats.flatMap(({ c, hb }) => (hb.runs ?? []).map((r) => ({ ...r, at: r.at ?? hb.at ?? c.createdAt }))).map((r) => applyRescores({ ...r, skill: stepIdOf(String(r.skill)) }, rescore.get(r.id))).filter((r) => Date.parse(r.at) >= cutoff && (!want || r.skill === want || skillOf(r.skill) === want));
}
function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function stats(rows) {
  return {
    runs: rows.length,
    medianScore: median(rows.flatMap((r) => typeof r.score === "number" ? [r.score] : [])),
    failureRate: rows.length ? rows.filter((r) => r.outcome !== "done").length / rows.length : 0,
    minutes: Math.round(rows.reduce((t, r) => t + (r.minutes ?? 0), 0) * 100) / 100
  };
}
function groupStats(rows, key) {
  const g = /* @__PURE__ */ new Map();
  for (const r of rows) g.set(key(r), [...g.get(key(r)) ?? [], r]);
  return Object.fromEntries([...g].map(([k, v]) => [k, stats(v)]));
}
function clusters(rows, top = 10) {
  const g = /* @__PURE__ */ new Map();
  const add = (r, key) => {
    const k = `${r.skill}\0${JSON.stringify(key)}`;
    const c = g.get(k) ?? { skill: r.skill, ...key, count: 0, tickets: [] };
    c.count++;
    if (r.ticket && !c.tickets.includes(r.ticket)) c.tickets.push(r.ticket);
    g.set(k, c);
  };
  for (const r of rows) {
    if (r.outcome !== "done" && r.error) add(r, { error: normaliseError(r.error) });
    for (const [scorer, v] of Object.entries(r.scores ?? {})) if (isFail(v)) add(r, { scorer });
  }
  return [...g.values()].filter((c) => c.count >= 2).sort((a, b) => b.count - a.count).slice(0, top);
}
function byScorer(rows) {
  const g = /* @__PURE__ */ new Map();
  for (const r of rows) for (const [k, v] of Object.entries(r.scores ?? {})) g.set(k, [...g.get(k) ?? [], v]);
  return Object.fromEntries([...g].map(([k, all]) => {
    const vs = all.filter((v) => v !== "unscorable");
    const un = all.length - vs.length;
    return [k, {
      runs: vs.length,
      failRate: vs.length ? vs.filter(isFail).length / vs.length : 0,
      median: median(vs.filter((v) => typeof v === "number")),
      ...un ? { unscorable: un } : {}
    }];
  }));
}
function ticketUse(rows, maxTokens, top = 20) {
  const g = /* @__PURE__ */ new Map();
  for (const r of rows) if (r.ticket) g.set(r.ticket, [...g.get(r.ticket) ?? [], r]);
  const all = [...g].map(([ticket, rs]) => {
    const tokens = rs.reduce((t, r) => t + (r.tokens ?? 0), 0);
    const reworks = Math.max(0, rs.filter((r) => stepIdOf(r.skill) === "build").length - 1);
    return { ticket, runs: rs.length, tokens, minutes: Math.round(rs.reduce((t, r) => t + (r.minutes ?? 0), 0) * 100) / 100, ...reworks ? { reworks } : {}, ...maxTokens && tokens > maxTokens ? { overBudget: true } : {} };
  }).sort((a, b) => b.tokens - a.tokens || b.minutes - a.minutes);
  return {
    tickets: all.filter((t, i) => i < top || t.overBudget),
    ticketTotals: { tickets: all.length, runs: all.reduce((t, x) => t + x.runs, 0), tokens: all.reduce((t, x) => t + x.tokens, 0), minutes: Math.round(all.reduce((t, x) => t + x.minutes, 0) * 100) / 100 }
  };
}
async function readLedger(board, ticket, authors, graders = []) {
  const trusted = authors.map((a) => a.toLowerCase());
  if (!trusted.length) throw new Error("binding owners.bots is empty: no heartbeat author is trusted");
  const owners = graders.filter(Boolean).map((a) => a.toLowerCase());
  return (await board.comments(ticket)).filter((c) => {
    const by = c.author?.toLowerCase();
    if (parseHeartbeat(c.body) || isScores(c)) return trusted.includes(by);
    return owners.includes(by) && c.body.includes(GRADE_MARKER);
  });
}
async function readRuns(board, ticket, authors, q = {}, graders = []) {
  return flattenRuns(await readLedger(board, ticket, authors, graders), q);
}
function learningState(comments, everyCycles, enabled = false) {
  const beats = comments.map((c) => parseHeartbeat(c.body)).filter((hb) => hb && (hb.kind ?? "cycle") === "cycle");
  const learnAt = comments.map((c) => parseHeartbeat(c.body)).filter(Boolean).findIndex((hb) => (hb.runs ?? []).some((r) => stepIdOf(String(r.skill)) === "learn/improve"));
  const all = comments.map((c) => parseHeartbeat(c.body)).filter(Boolean);
  const cyclesSince = learnAt < 0 ? beats.length : all.slice(0, learnAt).filter((hb) => (hb.kind ?? "cycle") === "cycle").length;
  return { due: enabled && Number(everyCycles) > 0 && cyclesSince >= Number(everyCycles), judge: enabled, cyclesSince };
}
function scorersFor(root, id) {
  const ids = [stepIdOf(id), skillOf(stepIdOf(id))];
  const dir = join4(root, ".agents", "scorers");
  const out = [];
  for (const f of existsSync3(dir) ? readdirSync2(dir).filter((n) => n.endsWith(".md")) : []) {
    let fm;
    try {
      fm = (0, import_yaml3.parse)(/^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync5(join4(dir, f), "utf8"))?.[1] ?? "");
    } catch {
      continue;
    }
    if (!fm?.name || !["pass-fail", "0-4"].includes(fm.scale)) continue;
    if (fm.applies_to === "*" || Array.isArray(fm.applies_to) && fm.applies_to.some((a) => ids.includes(stepIdOf(String(a))))) out.push({ name: fm.name, scale: fm.scale, applies_to: fm.applies_to });
  }
  if (!out.some((s) => s.name === SCORE_SCORER)) out.unshift({ name: SCORE_SCORER, scale: "0-4", applies_to: "*" });
  return out;
}
function hardFacts(run, cr, required = []) {
  const facts = [];
  if (run.outcome === "failed" || run.outcome === "timeout" || run.outcome === "capped") facts.push([1, `outcome ${run.outcome}`]);
  const red = (cr?.checks ?? []).filter((c) => c.state === "failure" && (!required.length || required.includes(c.name)));
  if (red.length) facts.push([1, `red check on the head: ${red.map((c) => c.name).join(", ")}`]);
  if (!facts.length) return null;
  return { score: Math.min(...facts.map(([s]) => s)), facts: facts.map(([, f]) => f) };
}
function stepFile(root, id) {
  const step = findStep(readSkills(join4(root, ".agents", "skills")), stepIdOf(id));
  return step ? relative2(root, step.file).replaceAll("\\", "/") : `.agents/skills/${stepIdOf(id)}`;
}
async function plan(run, o) {
  let cr;
  if (run.cr && o.forge) try {
    cr = await o.forge.view(run.cr);
  } catch {
  }
  const uri = o.binding.traces?.uri;
  return {
    run,
    scorers: scorersFor(o.root, run.skill),
    evidence: {
      ...run.ticket ? { ticket: run.ticket } : {},
      ...run.cr ? { cr: cr?.url ?? run.cr, diff: `agentic-sdlc forge diff ${run.cr}` } : {},
      ...run.trace && uri ? { trace: uri.replaceAll("{run_id}", run.trace) } : {},
      skill: `${stepFile(o.root, run.skill)} at skillHash ${run.skillHash}`
    },
    cap: hardFacts(run, cr, o.binding.forge?.required_checks ?? [])
  };
}
function scoresComment(p, file, at = (/* @__PURE__ */ new Date()).toISOString()) {
  const scores = file?.scores;
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) throw new Error('scores file must be { "scores": { "<scorer>": <value> } }');
  const errors = [];
  const reasonOf = file.reasons && typeof file.reasons === "object" ? file.reasons : {};
  for (const [k, v] of Object.entries(scores)) {
    const s = p.scorers.find((x) => x.name === k);
    if (!s) errors.push(`scorer ${k} does not apply to ${p.run.skill} (applies: ${p.scorers.map((x) => x.name).join(", ")})`);
    else if (v === "unscorable" && k === SCORE_SCORER && p.cap) errors.push(`scorer ${k}: unscorable is not allowed while a hard fact caps the run (${p.cap.facts.join("; ")}): grade it 0 to ${p.cap.score}`);
    else if (v === "unscorable") {
      if (!(typeof reasonOf[k] === "string" && reasonOf[k].trim())) errors.push(`scorer ${k}: unscorable needs a reason in reasons.${k}`);
    } else if (s.scale === "pass-fail" ? v !== "pass" && v !== "fail" : !(Number.isInteger(v) && v >= 0 && v <= 4)) errors.push(`scorer ${k}: ${JSON.stringify(v)} is not on scale ${s.scale}`);
  }
  if (!(SCORE_SCORER in scores)) errors.push(`${SCORE_SCORER} is required`);
  if (errors.length) throw new Error(errors.join("\n"));
  const out = { ...scores };
  let cap;
  if (p.cap && typeof out[SCORE_SCORER] === "number" && out[SCORE_SCORER] > p.cap.score) {
    out[SCORE_SCORER] = p.cap.score;
    cap = p.cap.facts.join("; ");
  }
  const reasons = file.reasons;
  return `${SCORES_MARKER}
\`\`\`json
${JSON.stringify({ run: p.run.id, at, scores: out, ...cap ? { cap } : {}, ...reasons ? { reasons } : {} })}
\`\`\`
`;
}
function changeFailures(items, b, days, now) {
  const from = now - days * 864e5;
  const inWin = (t) => t !== void 0 && Date.parse(t) >= from && Date.parse(t) <= now;
  const last = b.product.environments.at(-1);
  const changes = items.filter((x) => x.status === "Done" && x.fields.shipped === `On ${last}` && inWin(x.updatedAt));
  const failures = items.filter((x) => inWin(x.createdAt) && (x.labels.includes("signal:deploy") || x.fields.priority === "P0" && (x.labels.includes(b.board.labels?.bug ?? "bug") || x.labels.some((l) => l.startsWith("signal:")))));
  return { changes, failures, rate: changes.length ? failures.length / changes.length : null };
}
async function measures(o) {
  const b = o.binding;
  const days = o.days ?? 30;
  const now = o.now ?? Date.now();
  const from = now - days * 864e5;
  const inWin = (t) => t !== void 0 && Date.parse(t) >= from && Date.parse(t) <= now;
  const hours = (a, z) => (Date.parse(z) - Date.parse(a)) / 36e5;
  const round = (n) => n === null ? null : Math.round(n * 100) / 100;
  const items = await o.board.list();
  const { changes, failures, rate } = changeFailures(items, b, days, now);
  const doneIn = items.filter((x) => x.status === "Done" && x.statusChangedAt && inWin(x.statusChangedAt));
  const leads = doneIn.map((x) => hours(x.createdAt, x.statusChangedAt)).filter((h) => h >= 0);
  const restore = failures.filter((x) => x.status === "Done" && x.statusChangedAt).map((x) => hours(x.createdAt, x.statusChangedAt)).filter((h) => h >= 0);
  const versions = new Set(changes.map((x) => x.fields.release_version).filter(Boolean));
  const none = (why) => ({ value: null, why });
  let reworkRate = none("no forge: review reports cannot be read");
  if (o.forge && doneIn.length) {
    try {
      const bots = ownersFor(b.owners, "forge").bots.map((x) => x.toLowerCase());
      const ids = new Set(doneIn.map((x) => x.id));
      const crs = (await o.forge.list({ state: "merged" })).filter((c) => c.closes.some((id) => ids.has(id)));
      let reworked = 0;
      for (const c of crs) {
        const cs = await o.forge.comments(c.n);
        if (cs.some((x) => bots.includes(x.author?.toLowerCase()) && isMarked(x.body, "verdict") && x.body.includes("REMEDIATION REQUIRED"))) reworked++;
      }
      reworkRate = crs.length ? { value: round(reworked / crs.length), crs: crs.length, reworked } : none("no merged CR closed a ticket that reached Done in the window");
    } catch (e) {
      reworkRate = none(`the forge could not be read: ${e.message}`);
    }
  } else if (o.forge) reworkRate = none("no ticket reached Done in the window");
  const slo = b.product.slo;
  let errorBudget;
  if (slo) {
    const w = changeFailures(items, b, slo.window_days, now);
    errorBudget = {
      max: slo.change_failure_rate_max,
      windowDays: slo.window_days,
      actual: round(w.rate),
      exhausted: w.rate !== null ? w.rate > slo.change_failure_rate_max : w.failures.length > 0,
      ...w.rate === null && w.failures.length ? { why: "change failures in the window and no change shipped to the last environment" } : {}
    };
  }
  return {
    window: { days, from: new Date(from).toISOString(), to: new Date(now).toISOString() },
    // Tickets at Done with Shipped on the last environment whose last board write is in the window, per week.
    deployFrequency: { value: round(changes.length / (days / 7)), changes: changes.length, versions: versions.size },
    // createdAt to the time the ticket entered Done (statusChangedAt), for tickets that reached Done in the window.
    leadTimeHours: leads.length ? { value: round(median(leads)), tickets: leads.length } : none("no ticket reached Done in the window with a status change time"),
    changeFailureRate: rate === null ? none("no change shipped to the last environment in the window") : { value: round(rate), failures: failures.length, changes: changes.length },
    timeToRestoreHours: restore.length ? { value: round(median(restore)), failures: restore.length } : none("no change failure in the window reached Done"),
    // Share of merged CRs closing a ticket that reached Done in the window with a trusted REMEDIATION REQUIRED verdict report.
    reworkRate,
    ...errorBudget ? { errorBudget } : {}
  };
}
function cycleMeta(comments) {
  const m = /* @__PURE__ */ new Map();
  for (const c of comments) {
    const hb = parseHeartbeat(c.body);
    for (const r of hb?.runs ?? []) m.set(r.id, { key: String(c.id), at: hb.at ?? c.createdAt, kind: hb.kind ?? "cycle", ...hb.factory ? { factory: String(hb.factory) } : {} });
  }
  return m;
}
function sinceMs(v, now = Date.now()) {
  return /^\d+(\.\d+)?$/.test(v) ? now - Number(v) * 864e5 : Date.parse(v);
}
function exportRows(comments, q = {}) {
  return flattenRuns(comments).filter((r) => (q.since === void 0 || Date.parse(r.at) >= q.since) && (!q.run || r.id === q.run)).sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1);
}
var import_yaml3, HEARTBEAT_MARKER, SCORE_SCORER, isFail, SCORES_MARKER, GRADE_MARKER, parseGrades, normaliseError, summarise, isScores, packageVersion, USAGE2, OPTIONS2, cli2;
var init_ledger = __esm({
  "src/ledger.ts"() {
    "use strict";
    init_util();
    import_yaml3 = __toESM(require_dist(), 1);
    init_ports();
    init_comments();
    init_skills();
    init_telemetry();
    HEARTBEAT_MARKER = stamp("heartbeat");
    SCORE_SCORER = "done-conditions";
    isFail = (v) => v === "fail" || typeof v === "number" && v <= 1;
    SCORES_MARKER = stamp("scores");
    GRADE_MARKER = "agentic-sdlc:grade";
    parseGrades = (body) => [...body.matchAll(/agentic-sdlc:grade\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap(([, id, scorer, v]) => {
      const score = v === "pass" || v === "fail" || v === "unscorable" ? v : /^[0-4]$/.test(v) ? Number(v) : void 0;
      return score === void 0 ? [] : [{ id, scorer, score, by: "human" }];
    });
    normaliseError = (msg) => msg.toLowerCase().replace(/(["'`]).*?\1/g, "<s>").replace(/\S*[\\/]\S*/g, "<path>").replace(/\b[0-9a-f]{7,40}\b/g, "<sha>").replace(/\d+(\.\d+)?/g, "<n>").replace(/\s+/g, " ").trim().slice(0, 120);
    summarise = (rows, o = {}) => ({
      total: stats(rows),
      byStep: groupStats(rows, (r) => r.skill),
      bySkill: groupStats(rows, (r) => skillOf(r.skill)),
      byModel: groupStats(rows, (r) => r.model),
      byExecutor: groupStats(rows, (r) => r.executor ?? "harness"),
      byScorer: byScorer(rows),
      failureClusters: clusters(rows),
      ...ticketUse(rows, o.maxTokensPerTicket)
    });
    isScores = (c) => c.body.trimStart().startsWith(SCORES_MARKER);
    packageVersion = () => {
      try {
        return JSON.parse(readFileSync5(new URL("../package.json", import.meta.url), "utf8")).version;
      } catch {
        return "unknown";
      }
    };
    USAGE2 = [
      "usage: ledger runs [--since <days>] [--skill <s>] | ledger summary [--since <days>] | ledger measures [--days <n>] | ledger hash <skill-dir>",
      "       ledger plan --run <id> | ledger record --run <id> --file <scores.json> | ledger stale --max-hours <h>",
      "       ledger export --format otlp|cdevents [--since <days|iso>] [--run <id>] [--out <file>] [--send]"
    ].join("\n");
    OPTIONS2 = { since: { type: "string" }, skill: { type: "string" }, run: { type: "string" }, file: { type: "string" }, days: { type: "string" }, "max-hours": { type: "string" }, format: { type: "string" }, out: { type: "string" }, send: { type: "boolean" } };
    cli2 = async (argv, ctx) => {
      const [verb, ...rest] = argv;
      let a;
      try {
        a = parseArgs2({ args: rest, options: OPTIONS2, allowPositionals: true });
      } catch (e) {
        console.error(flagError(e));
        return 2;
      }
      const days = a.values.days === void 0 ? 30 : Number(a.values.days);
      if (verb === "measures" && !(days > 0)) return console.error(USAGE2), 2;
      const sinceDays = a.values.since === void 0 || verb === "export" ? void 0 : Number(a.values.since);
      if (sinceDays !== void 0 && !(sinceDays >= 0)) return console.error(USAGE2), 2;
      const maxHours = Number(a.values["max-hours"]);
      if (verb === "stale" && !(maxHours > 0)) return console.error(USAGE2), 2;
      if ((verb === "plan" || verb === "record") && !a.values.run) return console.error(USAGE2), 2;
      if (verb === "record" && !a.values.file) return console.error(USAGE2), 2;
      if (verb === "export" && !["otlp", "cdevents"].includes(a.values.format ?? "")) return console.error("--format must be otlp or cdevents"), 2;
      if (verb === "export" && (a.values.since !== void 0 && !(sinceMs(a.values.since) >= 0) || a.values.send && a.values.out)) return console.error(USAGE2), 2;
      try {
        if (verb === "hash") {
          if (!a.positionals[0]) return console.error(USAGE2), 2;
          console.log(JSON.stringify({ skill: a.positionals[0], hash: hashSkill(resolve(ctx.root, a.positionals[0])) }));
          return 0;
        }
        if (!["runs", "summary", "plan", "record", "stale", "measures", "export"].includes(verb)) return console.error(USAGE2), 2;
        const b = ctx.binding;
        const { createBoard: createBoard2 } = await Promise.resolve().then(() => (init_board(), board_exports));
        const board = await createBoard2({ ...ctx, options: b.board.options });
        if (verb === "measures") {
          let forge2;
          try {
            const { createForge: createForge2 } = await Promise.resolve().then(() => (init_forge(), forge_exports));
            forge2 = createForge2({ ...ctx, options: b.forge.options });
          } catch {
          }
          console.log(JSON.stringify(await measures({ board, forge: forge2, binding: b, days }), null, 2));
          return 0;
        }
        const comments = await readLedger(board, b.heartbeat.ticket, ownersFor(b.owners, "board").bots, [...ownersFor(b.owners, "board").product, ...ownersFor(b.owners, "board").factory]);
        const forge = async () => {
          try {
            const { createForge: createForge2 } = await Promise.resolve().then(() => (init_forge(), forge_exports));
            return createForge2({ ...ctx, options: b.forge.options });
          } catch {
            return void 0;
          }
        };
        if (verb === "stale") {
          const newest = comments.find((c) => parseHeartbeat(c.body));
          const ageHours = newest ? Math.round((Date.now() - Date.parse(newest.createdAt)) / 36e5 * 10) / 10 : null;
          const stale = ageHours === null || ageHours > maxHours;
          console.log(JSON.stringify({ stale, newest: newest?.createdAt ?? null, ageHours, maxHours }));
          return stale ? 1 : 0;
        }
        if (verb === "plan" || verb === "record") {
          const run = flattenRuns(comments).find((r) => r.id === a.values.run);
          if (!run) throw new Error(`run ${a.values.run} is not in the ledger`);
          const p = await plan(run, { root: ctx.root, binding: b, forge: await forge() });
          if (verb === "plan") return console.log(JSON.stringify(p, null, 2)), 0;
          const body = scoresComment(p, JSON.parse(readFileSync5(resolve(ctx.root, a.values.file), "utf8")));
          const c = await board.comment(b.heartbeat.ticket, body);
          console.log(JSON.stringify({ run: run.id, comment: c.id, ...JSON.parse(body.split("\n")[2]) }));
          return 0;
        }
        if (verb === "export") {
          const rows2 = exportRows(comments, { since: a.values.since === void 0 ? void 0 : sinceMs(a.values.since), run: a.values.run });
          const meta = cycleMeta(comments);
          if (a.values.format === "otlp") {
            const doc = otlpTraces(rows2, meta, { version: packageVersion(), repo: repoOf(b) });
            if (a.values.send) {
              await sendOtlp(ctx, doc);
              console.log(JSON.stringify({ sent: "otlp", runs: rows2.length }));
            } else if (a.values.out) writeFileSync2(resolve(ctx.root, a.values.out), `${JSON.stringify(doc)}
`);
            else console.log(JSON.stringify(doc));
          } else {
            const events = cdEventsFromRuns(rows2, meta, b);
            if (a.values.send && !sinkOf(b, ctx.env, "cdevents")) throw new Error("telemetry.cdevents_sink_env is unset in the binding: nothing to send to");
            if (a.values.send) {
              for (const ev of events) await sendCdEvent(ctx, ev);
              console.log(JSON.stringify({ sent: "cdevents", events: events.length }));
            } else if (a.values.out) writeFileSync2(resolve(ctx.root, a.values.out), events.map((e) => `${JSON.stringify(e)}
`).join(""));
            else for (const ev of events) console.log(JSON.stringify(ev));
          }
          return 0;
        }
        const rows = flattenRuns(comments, { sinceDays, skill: a.values.skill });
        if (verb === "runs") return console.log(JSON.stringify(rows, null, 2)), 0;
        console.log(JSON.stringify({ ...summarise(rows, { maxTokensPerTicket: b.cycle?.max_tokens_per_ticket }), learning: learningState(comments, b.learning?.every_cycles, b.learning?.enabled === true) }, null, 2));
        return 0;
      } catch (e) {
        console.error(e.message);
        return 1;
      }
    };
  }
});

// src/vcs/git.ts
import { existsSync as existsSync4, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join as join5 } from "path";
function git(ctx) {
  const { trunk, release_prefix } = ctx.binding.vcs;
  const g = (...a) => ctx.exec("git", a, { cwd: ctx.root }).trim();
  const lines = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean);
  const plain = (what, v) => {
    if (typeof v !== "string" || !v || v.startsWith("-")) throw new Error(`vcs: ${what} not allowed: ${v}`);
    return v;
  };
  const NAMES = ["-c", "core.quotepath=off"];
  const base = () => g("merge-base", "HEAD", `origin/${trunk}`);
  const safeName = (name) => {
    if (!name || name.startsWith("-") || name.includes("..") || /[\s\\~^:?*[]/.test(name)) throw new Error(`change line name not allowed: ${name}`);
    g("check-ref-format", "--branch", name);
  };
  return {
    async start(name) {
      safeName(name);
      if (!isChangeLine(ctx.binding, name)) throw new Error(`vcs start: name not allowed: ${name} fits neither vcs.change_pattern (${ctx.binding.vcs.change_pattern}) nor vcs.factory_change_pattern (${ctx.binding.vcs.factory_change_pattern}): pass the full name`);
      g("fetch", "origin", trunk);
      const workdir = join5(ctx.root, ".agents", "work", name);
      const fetchBranch = () => {
        try {
          g("fetch", "origin", name);
          return true;
        } catch (e) {
          if (/couldn't find remote ref|could not find remote ref/i.test(String(e.message) + String(e.stderr ?? ""))) return false;
          throw e;
        }
      };
      const catchUp = () => {
        if (!fetchBranch()) return;
        try {
          ctx.exec("git", ["merge", "--ff-only", `origin/${name}`], { cwd: workdir });
        } catch {
        }
      };
      if (existsSync4(workdir)) {
        catchUp();
        return { workdir, ref: name };
      }
      g("worktree", "prune");
      const has = (ref) => {
        try {
          g("rev-parse", "--verify", "--quiet", ref);
          return true;
        } catch {
          return false;
        }
      };
      if (has(`refs/heads/${name}`)) {
        g("worktree", "add", workdir, name);
        catchUp();
      } else {
        const remote = fetchBranch();
        if (remote) g("worktree", "add", "-b", name, workdir, `origin/${name}`);
        else g("worktree", "add", "-b", name, workdir, `origin/${trunk}`);
      }
      return { workdir, ref: name };
    },
    async head() {
      return { ref: g("rev-parse", "--abbrev-ref", "HEAD"), sha: g("rev-parse", "HEAD") };
    },
    async changed(since) {
      if (since !== void 0) plain("revision", since);
      return lines(g(...NAMES, "diff", "--name-only", "--end-of-options", `${since ?? `origin/${trunk}`}...HEAD`));
    },
    async base() {
      return { sha: base() };
    },
    async push() {
      const ref = g("rev-parse", "--abbrev-ref", "HEAD");
      if (ref === trunk || ref === "HEAD") throw new Error(`vcs push: refusing to push ${ref === "HEAD" ? "a detached HEAD" : `the trunk '${trunk}'`}: start a change line`);
      g("push", "-u", "origin", ref);
      return { ref, sha: g("rev-parse", "HEAD") };
    },
    async cut(rev, release) {
      plain("revision", rev);
      plain("release", release);
      const ref = `refs/heads/${release_prefix}${release}`;
      g("push", "origin", `${rev}:${ref}`);
      return { ref };
    },
    async tag(name, rev) {
      plain("tag name", name);
      plain("revision", rev);
      g("tag", "-a", "-m", name, "--end-of-options", name, rev);
      g("push", "origin", `refs/tags/${name}`);
    },
    async tags(prefix) {
      const out = g("tag", "--sort=-creatordate", "--format=%(refname:short) %(*objectname) %(objectname)", "-l", `${prefix ?? ""}*`);
      return out.split("\n").filter(Boolean).map((l) => {
        const [name, a, b] = l.split(" ");
        return { name, sha: a || b };
      });
    },
    async drop(name) {
      safeName(name);
      g("worktree", "remove", "--force", join5(ctx.root, ".agents", "work", name));
      try {
        g("branch", "-D", name);
      } catch {
      }
    },
    async checkoutTests(rev, paths) {
      plain("revision", rev);
      paths.forEach((p) => plain("path", p));
      g("read-tree", "-u", "--reset", "--end-of-options", rev);
      if (paths.length) g("checkout", "HEAD", "--", ...paths);
    },
    async snapshot(rev) {
      plain("revision", rev);
      const workdir = mkdtempSync(join5(tmpdir(), "agentic-bench-"));
      g("worktree", "add", "--detach", workdir, rev);
      const w = (...a) => ctx.exec("git", a, { cwd: workdir });
      return {
        workdir,
        async changed() {
          w("add", "-A");
          return lines(w(...NAMES, "diff", "--cached", "--name-only", "--no-renames", "--end-of-options", rev));
        },
        async drop() {
          try {
            g("worktree", "remove", "--force", workdir);
          } catch {
          }
          rmSync(workdir, { recursive: true, force: true });
          try {
            g("worktree", "prune");
          } catch {
          }
        }
      };
    }
  };
}
var init_git = __esm({
  "src/vcs/git.ts"() {
    "use strict";
    init_ports();
  }
});

// src/vcs/index.ts
var vcs_exports = {};
__export(vcs_exports, {
  VERBS: () => VERBS2,
  cli: () => cli3,
  createVcs: () => createVcs
});
function createVcs(ctx) {
  const make = adapters[ctx.binding.vcs.adapter];
  if (!make) throw new Error(`unknown vcs adapter: ${ctx.binding.vcs.adapter}`);
  return make(ctx);
}
var adapters, VERBS2, cli3;
var init_vcs = __esm({
  "src/vcs/index.ts"() {
    "use strict";
    init_util();
    init_git();
    adapters = { git };
    VERBS2 = {
      start: {},
      head: {},
      base: {},
      push: {},
      cut: {},
      tag: {},
      drop: {},
      "checkout-tests": {},
      changed: { value: ["since"] },
      tags: { value: ["prefix"] }
    };
    cli3 = (argv, ctx) => guard(async () => {
      const [verb, ...rest] = argv;
      if (!verb || !Object.hasOwn(VERBS2, verb)) throw new UsageError(`unknown vcs verb: ${verb ?? ""}`);
      const a = parseStrict("vcs", verb, rest, VERBS2[verb]);
      const v = createVcs({ ...ctx, options: ctx.binding.vcs.options ?? {} });
      const need3 = (i) => {
        if (!a.pos[i]) throw new UsageError(`vcs ${verb}: missing argument`);
        return a.pos[i];
      };
      switch (verb) {
        case "start":
          return v.start(need3(0));
        case "head":
          return v.head();
        case "changed":
          return v.changed(a.get("since"));
        case "base":
          return v.base();
        case "push":
          return v.push();
        case "cut":
          return v.cut(need3(0), need3(1));
        case "tag":
          await v.tag(need3(0), need3(1));
          return {};
        case "drop":
          await v.drop(need3(0));
          return {};
        case "tags":
          return v.tags(a.get("prefix"));
        case "checkout-tests":
          await v.checkoutTests(need3(0), a.pos.slice(1));
          return {};
        default:
          throw new UsageError(`unknown vcs verb: ${verb ?? ""}`);
      }
    });
  }
});

// src/bench.ts
var bench_exports = {};
__export(bench_exports, {
  BENCH_STEP: () => BENCH_STEP,
  CASES_FILE: () => CASES_FILE,
  OPTIONS: () => OPTIONS3,
  PROOF_FILE: () => PROOF_FILE,
  RESULTS_DIR: () => RESULTS_DIR,
  SUITES_DIR: () => SUITES_DIR,
  VERIFY_CONFIG: () => VERIFY_CONFIG,
  addedFiles: () => addedFiles,
  agentCommand: () => agentCommand,
  area: () => area,
  benchStepFile: () => benchStepFile,
  buildCases: () => buildCases,
  cli: () => cli4,
  compare: () => compare,
  diverse: () => diverse,
  fill: () => fill,
  prompt: () => prompt,
  quote: () => quote,
  report: () => report,
  resolveExecutor: () => resolveExecutor,
  rule: () => rule,
  runBench: () => runBench,
  shell: () => shell,
  specAuthors: () => specAuthors,
  stratify: () => stratify,
  suiteFile: () => suiteFile,
  wilsonLower: () => wilsonLower
});
import { cpSync, existsSync as existsSync5, mkdirSync as mkdirSync2, mkdtempSync as mkdtempSync2, readdirSync as readdirSync3, readFileSync as readFileSync6, rmSync as rmSync2, writeFileSync as writeFileSync3 } from "fs";
import { tmpdir as tmpdir2 } from "os";
import { dirname as dirname2, join as join6, relative as relative3, resolve as resolve2 } from "path";
import { parseArgs as parseArgs3 } from "util";
function resolveExecutor(arg, binding) {
  if (arg.trim().startsWith("{")) return JSON.parse(arg);
  const e = binding.executors?.[arg] ?? (arg === "harness" ? { kind: "harness" } : void 0);
  if (!e) throw new Error(`no executor ${arg} in binding.executors`);
  return e;
}
function agentCommand(e, binding, vars) {
  if (e.kind === "harness") {
    if (!binding.agent_command) throw new Error("binding.agent_command is not set");
    return fill(binding.agent_command, vars);
  }
  if (e.kind === "command") {
    const l = limitsOf(binding, e);
    return fill(e.run, { ...vars, skill: BENCH_STEP, cr: "", max_turns: String(l.max_turns ?? ""), max_tokens: String(l.max_tokens ?? ""), max_minutes: String(l.max_minutes ?? "") });
  }
  throw new Error(`executor kind ${e.kind} cannot run on the bench; use harness or command`);
}
function quote(v, win = process.platform === "win32") {
  if (/[\r\n\0]/.test(v)) throw new Error(`refusing a command value with a newline or NUL: ${JSON.stringify(v)}`);
  if (!win) return `'${v.replaceAll("'", `'\\''`)}'`;
  if (v.includes('"')) throw new Error(`refusing a command value with a double quote: ${v}`);
  return `"${v.replace(/(\\+)$/, "$1$1")}"`;
}
function area(paths, isProof = PROOF_FILE) {
  const n = /* @__PURE__ */ new Map();
  for (const p of paths) if (!isProof.test(p)) {
    const a = p.split("/").slice(0, -1).slice(0, 2).join("/") || ".";
    n.set(a, (n.get(a) ?? 0) + 1);
  }
  return [...n].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
}
function stratify(cases, perSize, sizes = []) {
  const g = /* @__PURE__ */ new Map();
  for (const c of cases) g.set(c.size ?? "", [...g.get(c.size ?? "") ?? [], c]);
  const rank = (k) => sizes.includes(k) ? sizes.indexOf(k) : sizes.length + (k ? 0 : 1);
  return [...g].sort(([a], [b]) => rank(a) - rank(b)).flatMap(([, cs]) => {
    const s = [...cs].sort((a, b) => (a.mergedAt ?? "").localeCompare(b.mergedAt ?? ""));
    if (s.length <= perSize) return s;
    const idx = new Set(Array.from({ length: perSize }, (_, i) => perSize === 1 ? 0 : Math.round(i * (s.length - 1) / (perSize - 1))));
    return [...idx].map((i) => s[i]);
  });
}
function diverse(cases, n) {
  const g = /* @__PURE__ */ new Map();
  for (const c of cases) {
    const k = `${c.size ?? ""}|${c.area ?? ""}`;
    g.set(k, [...g.get(k) ?? [], c]);
  }
  const out = [];
  for (let i = 0; out.length < n && [...g.values()].some((cs) => cs.length > i); i++)
    for (const cs of g.values()) if (cs[i] && out.length < n) out.push(cs[i]);
  return out;
}
async function buildCases(board, forge, binding, limit, o = {}) {
  const isTest = rule(binding, "proof_pattern", PROOF_FILE);
  const trusted = specAuthors(binding).map((a) => a.toLowerCase());
  const mergedLimit = o.mergedLimit ?? (Number.isFinite(limit) ? Math.max(100, limit * 10) : 500);
  const read = await forge.list({ state: "merged", limit: mergedLimit, since: o.since });
  if (read.length >= mergedLimit) console.error(`bench: read the newest ${mergedLimit} merged CRs; older CRs were not read. Raise the cap with --merged-limit <n> or narrow the window with --since <date>.`);
  const merged2 = read.filter((c) => c.state === "merged");
  const tickets = (await board.list({ status: binding.board.done_statuses })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const cases = [];
  for (const t of tickets) {
    if (!o.perSize && cases.length >= limit) break;
    const cr = merged2.find((c) => c.closes.includes(t.id));
    if (!cr) continue;
    const d = await forge.diff(cr.n);
    const oracleTests = addedFiles(d).filter((p) => isTest.test(p));
    if (!oracleTests.length) continue;
    const touched = diffPaths(d);
    if (o.paths?.length && !touched?.some((p) => matchesAny(p, o.paths))) continue;
    const [spec] = (await board.comments(t.id, { marker: binding.spec_marker })).filter((s) => trusted.includes(s.author?.toLowerCase()));
    const body = spec?.body ?? t.body ?? (await board.get(t.id)).body ?? "";
    const size = t.fields?.size;
    cases.push({ id: t.id, ticket: t.id, title: t.title, spec: body, baseSha: cr.baseSha, headSha: cr.headSha, oracleTests, ...size ? { size } : {}, area: area(touched ?? [], isTest), mergedAt: t.updatedAt });
  }
  return o.perSize ? stratify(cases, o.perSize, binding.sizes).slice(0, limit) : cases;
}
function prompt(c, skillPath, workdir, fastCheck) {
  return [
    `Bench run. Implement ticket ${c.ticket} ("${c.title}") in ${workdir}.`,
    `Follow the skill at ${skillPath}, with one change: skip every board, forge and push step.`,
    `Stop when the code and its tests are written and \`${fastCheck}\` passes.`,
    "",
    "Spec:",
    "",
    c.spec,
    ""
  ].join("\n");
}
function carry(from, to, p) {
  const src = join6(from, p), dst = join6(to, p);
  if (!existsSync5(src)) return rmSync2(dst, { recursive: true, force: true });
  mkdirSync2(dirname2(dst), { recursive: true });
  cpSync(src, dst, { recursive: true });
}
async function runBench(cases, o, deps) {
  const executor = o.executor ?? { kind: "harness" };
  const now = deps.now ?? Date.now;
  const promptFile = (scratch, c) => join6(scratch, `${c.id}.md`);
  const command = (b, c, scratch, workdir) => agentCommand(executor, b, { model: o.model, ticket: c.ticket, prompt_file: promptFile(scratch, c), workdir });
  if (o.dryRun) return { dryRun: cases.map((c) => ({ id: c.id, command: command(o.binding, c, "<scratch>", "<workdir>") })) };
  const budget = o.binding.learning?.bench_budget ?? {};
  const trials = o.trials ?? 1;
  const planned = cases.length * trials;
  if (budget.max_runs && planned > budget.max_runs && !o.allowOverBudget)
    throw new Error(`bench plans ${planned} runs (${cases.length} cases x ${trials} trials), over learning.bench_budget.max_runs ${budget.max_runs}; lower --cases or --trials, raise the budget, or pass --allow-over-budget`);
  const vcs = deps.vcs;
  const snap = (rev) => vcs.snapshot(rev);
  const factory = o.factory ? await snap(o.factory) : void 0;
  const results = [];
  try {
    const binding = factory ? loadBinding(factory.workdir) : o.binding;
    if (cases[0]) command(binding, cases[0], "<scratch>", "<workdir>");
    const skillPath = benchStepFile(factory?.workdir ?? o.root);
    const isProof = rule(binding, "proof_pattern", PROOF_FILE);
    const isConfig = rule(binding, "verify_config_pattern", VERIFY_CONFIG);
    const scratch = mkdtempSync2(join6(tmpdir2(), "agentic-bench-prompts-"));
    const began = now();
    const spent = () => !!budget.max_minutes && (now() - began) / 6e4 >= budget.max_minutes;
    for (const c of cases) for (let trial = 1; trial <= trials; trial++) {
      if (spent()) {
        results.push({ id: c.id, ...trials > 1 ? { trial } : {}, pass: false, minutes: 0, skipped: "budget" });
        continue;
      }
      const trees = [];
      try {
        const agent = await snap(c.baseSha);
        trees.push(agent);
        writeFileSync3(promptFile(scratch, c), prompt(c, skillPath, agent.workdir, binding.commands.fast_check));
        const t0 = now();
        let error;
        try {
          shell(deps.exec, command(binding, c, scratch, agent.workdir), agent.workdir);
        } catch (e) {
          error = `agent: ${e.message.split("\n")[0]}`;
        }
        const minutes = Math.round((now() - t0) / 6e4 * 10) / 10;
        const touched = await agent.changed();
        const verify = await snap(c.baseSha);
        trees.push(verify);
        const scorerInput = o.scorerDir ? writeScorerInput(o.scorerDir, o.root, c, trials > 1 ? trial : 0, readFileSync6(promptFile(scratch, c), "utf8"), touched, verify.workdir, agent.workdir) : void 0;
        const oracle = await snap(c.headSha);
        trees.push(oracle);
        for (const p of touched) {
          if (isProof.test(p)) continue;
          carry(isConfig.test(p) ? oracle.workdir : agent.workdir, verify.workdir, p);
        }
        for (const p of c.oracleTests) carry(oracle.workdir, verify.workdir, p);
        let pass = true;
        try {
          if (binding.commands.install) shell(deps.exec, binding.commands.install, verify.workdir);
          shell(deps.exec, binding.commands.verify, verify.workdir);
        } catch {
          pass = false;
        }
        results.push({ id: c.id, ...trials > 1 ? { trial } : {}, pass, minutes, ...error ? { error } : {}, ...scorerInput ? { scorerInput } : {} });
      } finally {
        await dropAll(trees);
      }
    }
    rmSync2(scratch, { recursive: true, force: true });
  } finally {
    if (factory) await dropAll([factory]);
  }
  const ran = results.filter((r) => !r.skipped);
  return {
    model: o.model,
    executor: o.executorName ?? (o.executor ? "inline" : "harness"),
    executorKind: executor.kind,
    ...o.factory ? { factory: o.factory } : {},
    ...o.suite ? { suite: o.suite } : {},
    at: new Date(now()).toISOString(),
    cases: results,
    passRate: ran.length ? ran.filter((r) => r.pass).length / ran.length : 0,
    minutes: Math.round(results.reduce((t, r) => t + r.minutes, 0) * 100) / 100
  };
}
function writeScorerInput(dir, root, c, trial, promptText, touched, base, after) {
  const read = (d, p) => {
    if (!existsSync5(join6(d, p))) return "(absent)";
    const t = readFileSync6(join6(d, p), "utf8");
    return t.length > MAX_FILE_CHARS ? `${t.slice(0, MAX_FILE_CHARS)}
\u2026 cut` : t;
  };
  const fence = "````";
  const parts = [promptText, "## Changed files", ...touched.flatMap((p) => [`### ${p}`, "Before:", fence, read(base, p), fence, "After:", fence, read(after, p), fence])];
  const file = join6(dir, `${c.id.replace(/[^\w.-]/g, "_")}${trial ? `-t${trial}` : ""}.md`);
  mkdirSync2(dir, { recursive: true });
  writeFileSync3(file, parts.join("\n\n") + "\n");
  return relative3(root, file).replaceAll("\\", "/");
}
function report(results) {
  const g = /* @__PURE__ */ new Map();
  for (const r of results) {
    const k = JSON.stringify([r.model, r.executor, r.factory ?? null]);
    const prev = g.get(k);
    g.set(k, { r, cases: [...prev?.cases ?? [], ...r.cases.filter((c) => !c.skipped)], skipped: (prev?.skipped ?? 0) + r.cases.filter((c) => c.skipped).length });
  }
  const rows = [...g.values()].map(({ r, cases, skipped }) => ({
    model: r.model,
    executor: r.executor,
    ...r.executorKind ? { executorKind: r.executorKind } : {},
    ...r.factory ? { factory: r.factory } : {},
    passRate: cases.length ? cases.filter((c) => c.pass).length / cases.length : 0,
    medianMinutes: median(cases.map((c) => c.minutes)),
    n: cases.length,
    pareto: false,
    // Budget-skipped cases: the row is incomplete, like too few cases, and never on the Pareto front.
    ...skipped ? { incomplete: true, skipped } : {}
  }));
  const cost = (x) => x.medianMinutes ?? Infinity;
  for (const a of rows) a.pareto = !a.incomplete && !rows.some((b) => b !== a && !b.incomplete && b.passRate >= a.passRate && cost(b) <= cost(a) && (b.passRate > a.passRate || cost(b) < cost(a)));
  return rows.sort((a, b) => b.passRate - a.passRate || cost(a) - cost(b));
}
function wilsonLower(pass, n, z = 1.96) {
  if (!n) return 0;
  const p = pass / n, z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}
function compare(a0, b0, o = {}) {
  const ran = (r) => ({ ...r, cases: r.cases.filter((c) => !c.skipped) });
  const skippedOf = (r) => r.cases.length - ran(r).cases.length;
  const [a, b] = [ran(a0), ran(b0)];
  const minCases = o.minCases ?? 20, trials = o.trials ?? 3;
  const ids = new Set(b.cases.map((c) => c.id));
  const common = [...new Set(a.cases.map((c) => c.id))].filter((id) => ids.has(id));
  const side = (r) => {
    const cs = r.cases.filter((c) => common.includes(c.id));
    const pass = cs.filter((c) => c.pass).length;
    const minTrials = common.length ? Math.min(...common.map((id) => cs.filter((c) => c.id === id).length)) : 0;
    const round = (x) => Math.round(x * 1e3) / 1e3;
    return { model: r.model, executor: r.executor, factory: r.factory, passRate: cs.length ? pass / cs.length : 0, lower: round(wilsonLower(pass, cs.length)), trials: minTrials, minutes: Math.round(cs.reduce((t, c) => t + c.minutes, 0) * 100) / 100 };
  };
  const [sa, sb] = [side(a), side(b)];
  const d = (x, y) => Math.round((y - x) * 1e3) / 1e3;
  const short = [
    ...[["a", a0], ["b", b0]].flatMap(([n, r]) => skippedOf(r) ? [`${n} skipped ${skippedOf(r)} runs on its budget`] : []),
    ...common.length < minCases ? [`${common.length} shared cases, need ${minCases}`] : [],
    ...Math.min(sa.trials, sb.trials) < trials ? [`${Math.min(sa.trials, sb.trials)} trials on a shared case, need ${trials}`] : [],
    ...new Set(b.cases.map((c) => c.id)).size < new Set(a.cases.map((c) => c.id)).size ? ["b ran fewer cases than a"] : []
  ];
  return {
    cases: common.length,
    a: sa,
    b: sb,
    delta: { passRate: d(sa.passRate, sb.passRate), lower: d(sa.lower, sb.lower), minutes: d(sa.minutes, sb.minutes) },
    // Too little evidence proves nothing: fail closed.
    ...short.length ? { insufficient: short } : {},
    regressed: short.length > 0 || sb.lower < sa.lower
  };
}
var BENCH_STEP, benchStepFile, CASES_FILE, SUITES_DIR, RESULTS_DIR, suiteFile, PROOF_FILE, addedFiles, VERIFY_CONFIG, rule, fill, shell, specAuthors, dropAll, MAX_FILE_CHARS, USAGE3, readJson, OPTIONS3, cli4;
var init_bench = __esm({
  "src/bench.ts"() {
    "use strict";
    init_util();
    init_binding();
    init_gates();
    init_ledger();
    init_ports();
    init_skills();
    BENCH_STEP = "build";
    benchStepFile = (root) => findStep(readSkills(join6(root, ".agents", "skills")), BENCH_STEP)?.file ?? join6(root, ".agents/skills/sdlc-build/SKILL.md");
    CASES_FILE = ".agents/bench/cases.json";
    SUITES_DIR = ".agents/bench/suites";
    RESULTS_DIR = ".agents/bench/results";
    suiteFile = (name) => {
      if (!/^[\w.-]+$/.test(name)) throw new Error(`bad suite name ${name}`);
      return `${SUITES_DIR}/${name}.json`;
    };
    PROOF_FILE = /(^|\/)(tests?|__tests__|spec|evals?|data[-_]?checks?|checks)\/|[._-](test|spec|eval|check)\.[^/]+$/i;
    addedFiles = (diff) => [...diff.matchAll(/^--- \/dev\/null\r?\n\+\+\+ (?:b\/)?(.+?)\s*$/gm)].map((m) => m[1]);
    VERIFY_CONFIG = /(^|\/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|pnpm-workspace\.yaml|bun\.lockb?|tsconfig[^/]*\.json|[^/]+\.config\.[^/]+|\.[^/]+rc(\.[^/]+)?|pytest\.ini|tox\.ini|setup\.cfg|pyproject\.toml|poetry\.lock|conftest\.py|Makefile|go\.mod|go\.sum|Cargo\.toml|Cargo\.lock|Gemfile(\.lock)?|composer\.(json|lock)|pom\.xml|[^/]+\.gradle(\.kts)?)$|^\.agents\//;
    rule = (b, key, dflt) => b.paths?.[key] ? new RegExp(String(b.paths[key])) : dflt;
    fill = (tpl, vars, win) => tpl.replace(/\{(\w+)\}/g, (m, k) => vars[k] === void 0 ? m : quote(vars[k], win));
    shell = (exec2, cmd, cwd) => process.platform === "win32" ? exec2("cmd", ["/d", "/v:off", "/c", "%AGENTIC_SDLC_CMD%"], { cwd, env: { ...process.env, AGENTIC_SDLC_CMD: cmd } }) : exec2("sh", ["-c", cmd], { cwd });
    specAuthors = (b) => {
      const o = ownersFor(b.owners, "board");
      return [...o.bots, ...o.product, ...o.factory];
    };
    dropAll = async (trees) => {
      for (const t of trees) try {
        await t.drop();
      } catch {
      }
    };
    MAX_FILE_CHARS = 2e4;
    USAGE3 = [
      "usage: bench build [--suite <name>] [--paths <glob>]\u2026 [--per-size <n>] [--limit n] [--merged-limit n] [--since <date>]",
      "       bench propose --suite <name> [--n k] [--merged-limit n] [--since <date>]",
      "       bench run [--suite <s>] --model <id> | --executor <name|json> [--model <id>] [--factory <rev>] [--cases <ids>] [--trials <n>] [--allow-over-budget] [--dry-run]",
      "       bench report --suite <s> [results.json\u2026]",
      "       bench compare <a.json> <b.json>"
    ].join("\n");
    readJson = (p) => JSON.parse(readFileSync6(p, "utf8"));
    OPTIONS3 = {
      limit: { type: "string" },
      model: { type: "string" },
      executor: { type: "string" },
      factory: { type: "string" },
      cases: { type: "string" },
      "dry-run": { type: "boolean" },
      "merged-limit": { type: "string" },
      since: { type: "string" },
      suite: { type: "string" },
      paths: { type: "string", multiple: true },
      "per-size": { type: "string" },
      n: { type: "string" },
      trials: { type: "string" },
      "allow-over-budget": { type: "boolean" }
    };
    cli4 = async (argv, ctx) => {
      const [verb, ...rest] = argv;
      let a;
      try {
        a = parseArgs3({ args: rest, options: OPTIONS3, allowPositionals: true });
      } catch (e) {
        console.error(flagError(e));
        return 2;
      }
      const { binding, root } = ctx;
      const with_ = (options, r = root) => ({ ...ctx, root: r, options: options ?? {} });
      try {
        if (verb === "compare") {
          const [pa, pb] = a.positionals;
          if (!pa || !pb) return console.error(USAGE3), 2;
          const r = compare(readJson(resolve2(root, pa)), readJson(resolve2(root, pb)), { minCases: binding?.learning?.bench_min_cases, trials: binding?.learning?.bench_trials });
          console.log(JSON.stringify(r, null, 2));
          return r.regressed ? 1 : 0;
        }
        const suite = a.values.suite;
        const mergedLimit = a.values["merged-limit"] ? Number(a.values["merged-limit"]) : void 0;
        if (mergedLimit !== void 0 && !(mergedLimit > 0) || a.values.since !== void 0 && Number.isNaN(Date.parse(a.values.since))) return console.error(USAGE3), 2;
        const suiteCases = (s) => readJson(join6(root, suiteFile(s))).cases;
        const allCases = async (limit, o) => {
          const { createBoard: createBoard2 } = await Promise.resolve().then(() => (init_board(), board_exports));
          const { createForge: createForge2 } = await Promise.resolve().then(() => (init_forge(), forge_exports));
          return buildCases(await createBoard2(with_(binding.board.options)), await createForge2(with_(binding.forge.options)), binding, limit, { ...o, mergedLimit, since: a.values.since });
        };
        if (verb === "report") {
          if (!suite) return console.error(USAGE3), 2;
          const dir = join6(root, RESULTS_DIR);
          const files = a.positionals.length ? a.positionals.map((p) => resolve2(root, p)) : existsSync5(dir) ? readdirSync3(dir).filter((f) => f.endsWith(".json")).map((f) => join6(dir, f)) : [];
          const results = files.map((f) => readJson(f)).filter((r) => r.suite === suite);
          console.log(JSON.stringify({ suite, results: results.length, rows: report(results) }, null, 2));
          return 0;
        }
        if (verb === "propose") {
          if (!suite) return console.error(USAGE3), 2;
          const n = a.values.n ? Number(a.values.n) : binding.learning.bench_size;
          if (!(n > 0)) return console.error(USAGE3), 2;
          const sdir = join6(root, SUITES_DIR);
          const used = new Set((existsSync5(sdir) ? readdirSync3(sdir).filter((f) => f.endsWith(".json")) : []).flatMap((f) => readJson(join6(sdir, f)).cases.map((c) => c.id)));
          const fresh = (await allCases(Infinity, { perSize: Infinity })).filter((c) => !used.has(c.id));
          console.log(JSON.stringify({ suite, cases: diverse(fresh, n) }, null, 2));
          return 0;
        }
        if (verb === "build") {
          const limit = a.values.limit ? Number(a.values.limit) : binding.learning.bench_size;
          const perSize = a.values["per-size"] ? Number(a.values["per-size"]) : void 0;
          if (!(limit > 0) || perSize !== void 0 && !(perSize > 0)) return console.error(USAGE3), 2;
          const cases = await allCases(limit, { paths: a.values.paths, perSize });
          const rel = suite ? suiteFile(suite) : CASES_FILE;
          const file = join6(root, rel);
          mkdirSync2(dirname2(file), { recursive: true });
          writeFileSync3(file, JSON.stringify(suite ? { name: suite, cases } : cases, null, 2) + "\n");
          console.log(JSON.stringify({ file: rel, cases: cases.length }));
          return 0;
        }
        if (verb === "run") {
          const trials = a.values.trials ? Number(a.values.trials) : binding.learning?.bench_trials ?? 3;
          if (!a.values.model && !a.values.executor || !(Number.isInteger(trials) && trials > 0)) return console.error(USAGE3), 2;
          const executor = a.values.executor ? resolveExecutor(a.values.executor, binding) : void 0;
          const model = a.values.model ?? binding.models.balanced;
          const executorName = a.values.executor ? a.values.executor.trim().startsWith("{") ? "inline" : a.values.executor : void 0;
          const label = a.values.model ?? executorName;
          const want = a.values.cases?.split(",").map((s) => s.trim());
          const cases = (suite ? suiteCases(suite) : readJson(join6(root, CASES_FILE))).filter((c) => !want || want.includes(c.id));
          const stem = `${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}-${label.replace(/[^\w.-]/g, "_")}`;
          const { createVcs: createVcs2 } = await Promise.resolve().then(() => (init_vcs(), vcs_exports));
          const r = await runBench(
            cases,
            { model, executor, executorName, factory: a.values.factory, suite, root, binding, dryRun: a.values["dry-run"], scorerDir: join6(root, RESULTS_DIR, stem), trials, allowOverBudget: a.values["allow-over-budget"] },
            { exec: ctx.exec, vcs: await createVcs2(with_(binding.vcs.options)) }
          );
          if ("cases" in r) {
            const file = `${RESULTS_DIR}/${stem}.json`;
            mkdirSync2(join6(root, RESULTS_DIR), { recursive: true });
            writeFileSync3(join6(root, file), JSON.stringify(r, null, 2) + "\n");
            const skipped = r.cases.filter((c) => c.skipped).length;
            console.log(JSON.stringify({ file, passRate: r.passRate, minutes: r.minutes, ...skipped ? { skipped, incomplete: true } : {} }));
          } else console.log(JSON.stringify(r, null, 2));
          return 0;
        }
        console.error(USAGE3);
        return 2;
      } catch (e) {
        console.error(e.message);
        return 1;
      }
    };
  }
});

// src/dispatch.ts
var dispatch_exports = {};
__export(dispatch_exports, {
  FLAGS: () => FLAGS,
  REVIEW_FIRE_ENV: () => REVIEW_FIRE_ENV,
  REVIEW_STEP: () => REVIEW_STEP,
  childEnv: () => childEnv,
  cli: () => cli5,
  executorFor: () => executorFor,
  judgeTier: () => judgeTier,
  limitsText: () => limitsText,
  managedRequest: () => managedRequest,
  passEnv: () => passEnv,
  resolveStage: () => resolveStage,
  setSpawn: () => setSpawn
});
import { spawn } from "child_process";
import { chmodSync, closeSync, lstatSync, mkdirSync as mkdirSync3, mkdtempSync as mkdtempSync3, openSync, writeFileSync as writeFileSync4 } from "fs";
import { tmpdir as tmpdir3 } from "os";
import { join as join7, relative as relative4 } from "path";
function judgeTier(b, runModel) {
  if (!runModel) return { skip: true, reason: "the judged run reported no model, so independence cannot be shown" };
  const want = b.learning?.judge_tier ?? "fast";
  const i = TIERS2.indexOf(want);
  const order = [want, ...TIERS2.slice(i + 1), ...TIERS2.slice(0, i).reverse()];
  const tier = order.find((t) => b.models[t] !== runModel);
  if (!tier) return { skip: true, reason: `every model tier is ${runModel}, the judged run's model; a model never grades its own run` };
  return { tier, model: b.models[tier] };
}
function resolveStage(b, ex, skillTier, judgeModel) {
  const mcps = {};
  for (const n of ex.mcps ?? []) {
    const m = b.mcps?.[n];
    if (!m) throw new Error(`mcp '${n}' is not in the binding's mcps`);
    mcps[n] = { ...m.url ? { url: m.url } : {}, ...m.command ? { command: m.command } : {}, ...m.token_env ? { token_env: m.token_env } : {} };
  }
  const tier = ex.model?.tier ?? skillTier;
  const model = judgeModel ?? ex.model?.id ?? (tier ? b.models?.[tier] : void 0);
  return { mcps, secrets: ex.secrets ?? [], sandbox: ex.sandbox ?? b.executors.default?.sandbox, model };
}
function passEnv(env) {
  const out = { ...env };
  delete out.AGENTIC_REVIEW_TOKEN;
  return out;
}
function childEnv(env, secrets) {
  const out = {};
  for (const k of [...BASE_ENV, ...secrets]) {
    if (env[k] === void 0 && secrets.includes(k)) throw new Error(`set the ${k} environment variable`);
    if (env[k] !== void 0) out[k] = env[k];
  }
  return out;
}
function executorFor(b, id) {
  const by = /* @__PURE__ */ new Map();
  const keys = Object.keys(b.executors).filter((k) => k !== "default");
  for (const k of [...keys.filter((k2) => stepIdOf(k2) !== k2), ...keys.filter((k2) => stepIdOf(k2) === k2)]) by.set(stepIdOf(k), b.executors[k]);
  return by.get(id) ?? by.get(skillOf(id)) ?? b.executors.default;
}
function managedRequest(ex, env, t, model, stageBody) {
  const token = envOf(env, ex.token_env);
  const endpoint = (name, dflt) => (name ? envOf(env, name) : dflt).replace(/\/$/, "");
  const text = taskText(t);
  const api = ex.api ?? "generic";
  if ((api === "claude" || api === "antigravity") && (t.skill === "learn/judge" || ex.model)) {
    throw new Error(`managed api ${api} cannot pin a model; use harness, command or cursor for this stage`);
  }
  switch (api) {
    case "claude":
      return ["POST", `${endpoint(ex.endpoint_env, "https://api.anthropic.com")}/v1/sessions`, {
        headers: { "x-api-key": token, "anthropic-version": "2026-10-21", "anthropic-beta": "managed-agents-2026-04-01" },
        body: {
          agent: envOf(env, need(ex.agent_env, "agent_env")),
          environment_id: envOf(env, need(ex.environment_env, "environment_env")),
          initial_events: [{ type: "user.message", content: [{ type: "text", text }] }]
        }
      }];
    case "cursor":
      return ["POST", `${endpoint(ex.endpoint_env, "https://api.cursor.com")}/v1/agents`, {
        headers: { authorization: `Bearer ${token}` },
        body: { prompt: { text }, repos: [{ url: need(ex.repo_url, "repo_url") }], autoCreatePR: false, ...model ? { model } : {} }
      }];
    case "antigravity":
      return ["POST", `${endpoint(ex.endpoint_env, "https://generativelanguage.googleapis.com")}/v1beta/interactions`, {
        headers: { "x-goog-api-key": token },
        body: { agent: ex.agent_env ? envOf(env, ex.agent_env) : "antigravity-preview-09-2026", environment: "remote", input: text, background: true }
      }];
    default:
      return ["POST", `${endpoint(need(ex.endpoint_env, "endpoint_env"), "")}/sessions`, {
        headers: { authorization: `Bearer ${token}` },
        body: { agent: envOf(env, need(ex.agent_env, "agent_env")), task: t, ...stageBody }
      }];
  }
}
var envOf, TIERS2, BASE_ENV, spawnChild, setSpawn, subject, limitsText, taskText, REVIEW_STEP, REVIEW_FIRE_ENV, need, FLAGS, cli5;
var init_dispatch = __esm({
  "src/dispatch.ts"() {
    "use strict";
    init_board();
    init_bench();
    init_ports();
    init_comments();
    init_skills();
    envOf = (env, name) => {
      const v = env[name];
      if (!v) throw new Error(`set the ${name} environment variable`);
      return v;
    };
    TIERS2 = ["fast", "balanced", "deep"];
    BASE_ENV = ["PATH", "HOME", "USERPROFILE", "SystemRoot", "TEMP", "TMP", "APPDATA", "LOCALAPPDATA", "ComSpec", "PATHEXT", "SystemDrive"];
    spawnChild = spawn;
    setSpawn = (f) => {
      const prev = spawnChild;
      spawnChild = f;
      return prev;
    };
    subject = (t) => t.ticket ? `ticket ${t.ticket}${t.cr ? ` (change request ${t.cr})` : ""}` : `change request ${t.cr}`;
    limitsText = (l = {}) => {
      const parts = [l.max_turns && `${l.max_turns} turns`, l.max_tokens && `${l.max_tokens} tokens`, l.max_minutes && `${l.max_minutes} minutes`].filter(Boolean);
      return parts.length ? ` Limits for this run: at most ${parts.join(", ")}; stop at the first one you reach.` : "";
    };
    taskText = (t) => `Run step ${t.skill} on ${subject(t)}. Load ${t.file ?? `.agents/skills/${t.skill}/SKILL.md`} first and follow it.${limitsText(t.limits)}${t.done ? ` Put the line ${t.done} in your closing comment.` : ""}${t.run ? ` Your run id is ${t.run}: end every commit you make with the trailer Agent-Run: ${t.run}.` : ""}`;
    REVIEW_STEP = "review/review";
    REVIEW_FIRE_ENV = "AGENTIC_REVIEW_FIRE_CMD";
    need = (v, name) => {
      if (v === void 0 || v === "") throw new Error(`managed executor needs ${name}`);
      return v;
    };
    FLAGS = ["ticket", "cr", "workdir", "run", "run-model", "unattended"];
    cli5 = async (argv, ctx) => {
      let onFail;
      let sent = false;
      try {
        const f = {};
        const pos = [];
        const KNOWN = FLAGS;
        for (let i = 0; i < argv.length; i++) {
          if (!argv[i].startsWith("--")) {
            pos.push(argv[i]);
            continue;
          }
          const [name, inline] = argv[i].slice(2).split(/=(.*)/s, 2);
          if (!KNOWN.includes(name)) {
            console.error(`unknown flag --${name}`);
            return 2;
          }
          if (name === "unattended") {
            f.unattended = "1";
            continue;
          }
          const v = inline ?? argv[++i];
          if (v === void 0 || inline === void 0 && v.startsWith("--")) {
            console.error(`--${name} needs a value`);
            return 2;
          }
          f[name] = v;
        }
        const [arg] = pos;
        const usage = "usage: agentic-sdlc dispatch <skill>[/<step>] [--ticket <id>] [--cr <n>] (at least one; none for learn/improve) [--run <id>] [--workdir <d>] [--run-model <id>] [--unattended]";
        if (!arg) {
          console.error(usage);
          return 2;
        }
        const pack = readSkills(join7(ctx.root, ".agents", "skills"));
        const step = findStep(pack, arg);
        if (!step) {
          console.error(`unknown step '${arg}'; ${pack.steps.length ? `valid ids: ${pack.steps.map((x) => x.id).join(", ")}` : ".agents/skills holds no steps: run agentic-sdlc init"}
${usage}`);
          return 2;
        }
        const skill = step.id;
        if (!f.ticket && !f.cr && skill !== "learn/improve") {
          console.error(usage);
          return 2;
        }
        const ticket = f.ticket ?? "", cr = f.cr ?? "", workdir = f.workdir ?? ctx.root;
        const b = ctx.binding;
        const file = relative4(ctx.root, step.file).replaceAll("\\", "/");
        const outside = skill === REVIEW_STEP && !!b.forge?.review_identity && ctx.env.AGENTIC_SDLC_ROLE !== "review" && !Object.keys(b.executors).some((k) => k !== "default" && stepIdOf(k) === skill);
        const fire = outside ? ctx.env[REVIEW_FIRE_ENV] || void 0 : void 0;
        const ex = fire ? { kind: "command", run: fire } : executorFor(b, skill);
        const via = skill === REVIEW_STEP ? outside ? fire ? "review-runtime" : "job-dependency" : "executor" : void 0;
        const startedAt = (/* @__PURE__ */ new Date()).toISOString();
        const judge = skill === "learn/judge" ? judgeTier(b, f["run-model"]) : void 0;
        if (judge && "skip" in judge) {
          console.log(JSON.stringify(judge));
          return 0;
        }
        let board;
        const boardOf = () => board ??= createBoard({ ...ctx, options: b.board.options });
        const target = (skill === "learn/judge" ? "" : ticket) || b.heartbeat?.ticket;
        const window = Number(b.cycle?.dedupe_minutes) || 0;
        let key = [ticket || cr || "factory", skill, f.run].filter(Boolean).join("-");
        let locked = false;
        let isBot;
        if (window > 0 && target) {
          let head = "";
          if (cr) {
            try {
              const { createForge: createForge2 } = await Promise.resolve().then(() => (init_forge(), forge_exports));
              head = (await createForge2({ ...ctx, options: b.forge.options }).view(cr)).headSha;
            } catch {
            }
          }
          key = [ticket || cr || "factory", skill, f.run, head].filter(Boolean).join("-");
          locked = true;
          const trusted = ownersFor(b.owners, "board").bots.map((a) => a.toLowerCase());
          const closer = ex.kind === "assign" ? String(ex.user ?? "").toLowerCase() : "";
          const bot = isBot = (c) => trusted.includes(String(c.author).toLowerCase()) || !!closer && String(c.author).toLowerCase() === closer;
          const all = (await boardOf().comments(target)).filter(bot);
          const mine = all.filter((c) => c.body.trimStart().startsWith(matches("dispatch", key))).sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt))[0];
          const at = mine ? Date.parse(mine.createdAt) : NaN;
          const later = (c) => c.id !== mine?.id && Date.parse(c.createdAt) >= at;
          const finished = mine && all.some((c) => later(c) && c.body.includes(stamp("done", key)));
          const stall = Number(b.stall_minutes) || 0;
          const age = Number.isNaN(at) ? 0 : (Date.now() - at) / 6e4;
          if (mine && !finished && (age < window || age < stall)) {
            console.log(JSON.stringify({ skipped: true, key, since: mine.createdAt, comment: mine.id, reason: age < window ? "double fire" : "the previous run has not finished" }));
            return 0;
          }
        }
        let marker;
        const done = async (kind, ref, extra = {}) => {
          console.log(JSON.stringify({ kind, ref: ref ?? (kind === "assign" ? marker ?? null : null), startedAt, ...run ? { run } : {}, key, done: stamp("done", key), ...via ? { via } : {}, ...extra }));
          return 0;
        };
        const doneLine = stamp("done", key);
        const run = (b.forge?.provenance ?? "off") === "off" ? void 0 : locked ? key : [ticket || (cr ? `cr${cr}` : "factory"), skill, startedAt.replace(/\D/g, "")].join("-");
        if (skill === "sdlc") {
          if (locked) await boardOf().comment(target, `${stamp("dispatch", key)}
agentic-sdlc: cycle claimed`);
          return await done("claim", null);
        }
        if (outside && !fire) return await done("fire", null);
        const skillTier = step.tier;
        const stage = resolveStage(b, ex, judge?.tier ?? skillTier, judge?.model);
        const local = !fire && (stage.sandbox === "local" || !stage.sandbox && (ex.kind === "command" || ex.kind === "harness"));
        const localOk = stage.sandbox === "local" && ctx.env.AGENTIC_SDLC_LOCAL === "1";
        if (local && !localOk && (f.unattended || ctx.env.AGENTIC_SDLC_UNATTENDED === "1")) {
          throw new Error(`executor for ${skill} uses sandbox ${stage.sandbox ?? "local (unset)"}; unattended runs refuse it (local execution: sandbox local and AGENTIC_SDLC_LOCAL=1)`);
        }
        const limits = limitsOf(b, ex);
        const hasLimits = Object.keys(limits).length > 0;
        const info = { ...judge ?? {}, model: stage.model, mcps: stage.mcps, sandbox: stage.sandbox, ...hasLimits ? { limits } : {} };
        if (locked || ex.kind === "assign") {
          marker = (await boardOf().comment(target, `${stamp("dispatch", key)}
agentic-sdlc: run step ${skill} (${ex.kind})${limitsText(limits)}; close with ${stamp("done", key)}`)).id;
          const k = key;
          if (locked && isBot) {
            const all = (await boardOf().comments(target)).filter(isBot);
            const markers = all.filter((c) => c.body.trimStart().startsWith(matches("dispatch", key)));
            const order = (x, y) => Date.parse(x.createdAt) - Date.parse(y.createdAt) || String(x.id).localeCompare(String(y.id), void 0, { numeric: true });
            const me = markers.find((c) => c.id === marker);
            const owner = me && markers.find((c) => {
              const age = (Date.now() - Date.parse(c.createdAt)) / 6e4;
              const finished = all.some((d) => !markers.includes(d) && d.body.includes(stamp("done", key)) && Date.parse(d.createdAt) >= Date.parse(c.createdAt));
              return c !== me && order(c, me) < 0 && !finished && !(age >= window);
            });
            if (owner) {
              console.log(JSON.stringify({ skipped: true, key, since: owner.createdAt, comment: owner.id, reason: "double fire" }));
              return 0;
            }
          }
          onFail = () => sent ? Promise.resolve() : boardOf().comment(target, `${stamp("done", k)}
agentic-sdlc: ${skill} did not start`);
        }
        if (ex.kind === "harness") {
          return await done("harness", null, { instruction: `load ${file} in a subagent at tier ${judge?.tier ?? skillTier}${hasLimits ? `; ${limitsText(limits).trim()}` : ""}${doneLine ? `; the subagent puts the line ${doneLine} in its closing comment` : ""}; its dispatch key is ${key}${run ? `; its run id is ${run}` : ""}`, tier: judge?.tier ?? skillTier, ...info, secrets: stage.secrets });
        }
        if (ex.kind === "command") {
          const dir = mkdtempSync3(join7(tmpdir3(), "agentic-sdlc-"));
          const promptFile = join7(dir, "prompt.md");
          writeFileSync4(promptFile, `${taskText({ skill, ticket, cr, file, done: doneLine, run, limits })}
`);
          const mcpsFile = join7(dir, "mcps.json");
          writeFileSync4(mcpsFile, JSON.stringify(stage.mcps, null, 2));
          const vars = { skill, ticket, cr, workdir, prompt_file: promptFile, mcps_file: mcpsFile, max_turns: String(limits.max_turns ?? ""), max_tokens: String(limits.max_tokens ?? ""), max_minutes: String(limits.max_minutes ?? ""), ...stage.model ? { model: stage.model } : {} };
          const line = fill(ex.run, vars);
          const env = { ...fire ? passEnv(ctx.env) : childEnv(ctx.env, stage.secrets), ...limits.max_turns ? { AGENTIC_SDLC_MAX_TURNS: String(limits.max_turns) } : {}, ...limits.max_tokens ? { AGENTIC_SDLC_MAX_TOKENS: String(limits.max_tokens) } : {}, ...limits.max_minutes ? { AGENTIC_SDLC_MAX_MINUTES: String(limits.max_minutes) } : {} };
          const logDir = join7(tmpdir3(), "agentic-sdlc-runs");
          mkdirSync3(logDir, { recursive: true, mode: 448 });
          const st = lstatSync(logDir);
          if (!st.isDirectory() || st.isSymbolicLink() || process.getuid && st.uid !== process.getuid()) throw new Error(`${logDir} is not a folder of yours; remove it and retry`);
          if (process.platform !== "win32") chmodSync(logDir, 448);
          const log = join7(logDir, `${startedAt}-${skill}-${ticket || `cr${cr}`}`.replace(/[^\w.-]/g, "_") + ".log");
          const fd = openSync(log, "a", 384);
          try {
            const [cmd, args, childVars] = process.platform === "win32" ? ["cmd", ["/d", "/v:off", "/c", "%AGENTIC_SDLC_CMD%"], { ...env, AGENTIC_SDLC_CMD: line }] : ["sh", ["-c", line], env];
            const child = spawnChild(cmd, args, { cwd: workdir, env: childVars, detached: true, stdio: ["ignore", fd, fd], windowsHide: true });
            child.on("error", () => {
            });
            child.unref();
            if (!child.pid) throw new Error(`could not start the command executor for ${skill}; see ${log}`);
            sent = true;
            return await done(fire ? "fire" : "command", String(child.pid), { log, ...info });
          } finally {
            closeSync(fd);
          }
        }
        const stageBody = { model: stage.model, mcps: Object.entries(stage.mcps).map(([name, m]) => ({ name, url: m.url })), sandbox: stage.sandbox, ...hasLimits ? { limits } : {} };
        if (ex.kind === "webhook") {
          const headers = ex.token_env ? { authorization: `Bearer ${envOf(ctx.env, ex.token_env)}` } : {};
          const url = envOf(ctx.env, ex.url_env);
          sent = true;
          const r = await ctx.http("POST", url, { headers, body: { skill, file, ticket, cr, callback: null, ...doneLine ? { done: doneLine } : {}, ...run ? { run } : {}, ...stageBody } });
          return await done("webhook", r?.id ?? null);
        }
        if (ex.kind === "managed") {
          const req = managedRequest(ex, ctx.env, { skill, ticket, cr, file, done: doneLine, run, ...hasLimits ? { limits } : {} }, stage.model, stageBody);
          sent = true;
          const r = await ctx.http(...req);
          return await done("managed", r?.id ?? r?.name ?? null);
        }
        if (ex.kind !== "assign") throw new Error(`unknown executor kind '${ex.kind}' for ${skill}`);
        if (!ticket) throw new Error("executor kind assign needs --ticket");
        await boardOf().assign(ticket, ex.user);
        return await done("assign", null);
      } catch (e) {
        if (sent && (e instanceof TypeError || / -> 4\d\d:/.test(String(e.message)))) sent = false;
        if (onFail) await onFail().catch(() => void 0);
        console.error(e.message);
        return 1;
      }
    };
  }
});

// src/gates.ts
var gates_exports = {};
__export(gates_exports, {
  approval: () => approval,
  approvalClass: () => approvalClass,
  approvalNeed: () => approvalNeed,
  approvalWho: () => approvalWho,
  approvers: () => approvers,
  benchedSkills: () => benchedSkills,
  branchNames: () => branchNames,
  classify: () => classify,
  cli: () => cli6,
  cliCalls: () => cliCalls,
  cliFlags: () => cliFlags,
  cliVerbs: () => cliVerbs,
  depsOf: () => depsOf,
  diffPaths: () => diffPaths,
  frontmatter: () => frontmatter,
  globToRegExp: () => globToRegExp,
  linkage: () => linkage,
  matchesAny: () => matchesAny,
  merged: () => merged,
  proofFiles: () => proofFiles,
  proofRunner: () => proofRunner,
  proofsOnBase: () => proofsOnBase,
  provenance: () => provenance,
  review: () => review,
  shipped: () => shipped,
  signalOnRed: () => signalOnRed,
  skillPackCheck: () => skillPackCheck,
  skillRegression: () => skillRegression,
  trailers: () => trailers
});
import { existsSync as existsSync6, readFileSync as readFileSync7, readdirSync as readdirSync4 } from "fs";
import { dirname as dirname3, join as join8, relative as relative5, resolve as resolve3 } from "path";
import { isDeepStrictEqual } from "util";
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}
function diffPaths(diff) {
  const out = [];
  for (const raw of diff.split("\n")) {
    if (!raw.startsWith("diff --git ")) continue;
    const rest = raw.slice("diff --git ".length).replace(/\r$/, "");
    if (rest.includes('"') || !rest.startsWith("a/")) return null;
    const cuts = [...rest.matchAll(/ b\//g)].map((m) => m.index);
    const cut = cuts.length === 1 ? cuts[0] : cuts.find((i) => rest.slice(2, i) === rest.slice(i + 3));
    if (cut === void 0) return null;
    out.push(rest.slice(2, cut), rest.slice(cut + 3));
  }
  return out;
}
function benchedSkills(root) {
  const dir = join8(root, ".agents", "bench", "suites");
  const out = /* @__PURE__ */ new Set();
  if (!existsSync6(dir)) return out;
  for (const f of readdirSync4(dir).filter((n) => n.endsWith(".json"))) {
    try {
      const suite = JSON.parse(readFileSync7(join8(dir, f), "utf8"));
      if (Array.isArray(suite?.cases) && suite.cases.length) out.add(skillOf(stepIdOf(typeof suite.skill === "string" ? suite.skill : BENCH_STEP)));
    } catch {
    }
  }
  return out;
}
async function classify(d, cr, diff) {
  if (diff === void 0) return "guardrail";
  const paths = diffPaths(diff);
  if (!paths) return "guardrail";
  const inFactory = paths.filter((p) => matchesAny(p, factoryGlobs(d.binding)));
  if (!inFactory.length) return "product";
  if (inFactory.length < paths.length) return "guardrail";
  if (/^deleted file mode/m.test(diff)) return "guardrail";
  const at = (p, sha2) => d.fileAt?.(p, sha2);
  let benched;
  for (const p of new Set(paths)) {
    const skill = SKILL_MD.exec(p)?.[1];
    if (skill) {
      const [b, h] = [at(p, cr.baseSha), at(p, cr.headSha)].map((t) => t === void 0 ? void 0 : frontmatter(t));
      if (!b || !h || b.body !== h.body || !tiersValid(h.fm) || isDeepStrictEqual(tiersOf(b.fm), tiersOf(h.fm))) return "guardrail";
      if (!isDeepStrictEqual(withoutTier(b.fm), withoutTier(h.fm))) return "guardrail";
      if (!(benched ??= benchedSkills(d.root)).has(logicalName(skill))) return "guardrail";
      continue;
    }
    if (p !== BINDING_PATH) return "guardrail";
    let base, head;
    try {
      base = (0, import_yaml4.parse)(at(p, cr.baseSha) ?? "");
      head = (0, import_yaml4.parse)(at(p, cr.headSha) ?? "");
    } catch {
      return "guardrail";
    }
    if (!base || typeof base !== "object" || !head || typeof head !== "object") return "guardrail";
    const keys = /* @__PURE__ */ new Set([...Object.keys(base), ...Object.keys(head)]);
    if ([...keys].some((k) => !TUNING_KEYS.includes(k) && !isDeepStrictEqual(base[k], head[k]))) return "guardrail";
  }
  return "tuning";
}
function branchNames(b, names) {
  const v = b.vcs;
  const ok = (n) => n === v.trunk || !!v.release_prefix && n.startsWith(v.release_prefix) || n.startsWith("dependabot/") || n.startsWith("renovate/") || isChangeLine(b, n);
  return names.filter((n) => !ok(n));
}
function proofRunner(run) {
  return (cmd) => {
    try {
      run(cmd);
      return true;
    } catch (e) {
      if (typeof e.status === "number") return false;
      throw new Error(`proof runner failed (not a test result): ${e.message}`);
    }
  };
}
async function post(d, sha2, description, ok) {
  await d.forge.status(sha2, { context: "ticket-linkage", state: ok ? "success" : "failure", description: description.slice(0, 140) }, { as: "ci" });
}
async function linkage(d, n) {
  const cr = await d.forge.view(n);
  const diff = await readDiff(d, n);
  const cls = await classify(d, cr, diff);
  const paths = diff === void 0 ? null : diffPaths(diff);
  if (cls !== "product" && paths?.every((p) => matchesAny(p, factoryGlobs(d.binding)))) {
    await post(d, cr.headSha, "factory change: no ticket", true);
    return { ok: true, factory: true, class: cls, errors: [] };
  }
  if (DEPENDENCY_LINES.test(cr.source) && DEPENDENCY_BOTS.test(cr.author ?? "") && !cr.closes.length) {
    await post(d, cr.headSha, "dependency update: no ticket", true);
    return { ok: true, factory: false, dependency: true, class: cls, errors: [] };
  }
  const errors = [];
  if (cr.closes.length !== 1) errors.push(`CR ${n} must close exactly one ticket, found ${cr.closes.length}`);
  else {
    const id = cr.closes[0];
    let why = "";
    const item = await d.board.get(id).catch((e) => {
      why = String(e.message ?? e).split("\n").slice(-1)[0];
      return void 0;
    });
    if (!item) errors.push(`ticket ${id} is not on the board${why ? ` (${why})` : ""}`);
    else if (d.binding.board.done_statuses.includes(item.status)) errors.push(`ticket ${id} is not open (${item.status})`);
    if (!nameHas(cr.source, id)) errors.push(`source change line "${cr.source}" does not name ${id}`);
  }
  await post(d, cr.headSha, errors.length ? errors[0] : "closes one open ticket", !errors.length);
  return { ok: !errors.length, factory: false, class: cls, errors };
}
function approvers(reviews, sha2) {
  const last = /* @__PURE__ */ new Map();
  for (const r of reviews) if (r.state !== "commented" && r.state !== "pending") last.set(r.user.toLowerCase(), r);
  return [...last].filter(([, r]) => r.state === "approved" && r.sha === sha2).map(([u]) => u);
}
async function approvalClass(d, cr, diff) {
  const b = d.binding;
  const cls = await classify(d, cr, diff);
  if (!factoryGlobs(b).length) return "guardrail";
  if (cls !== "product") return cls;
  const item = cr.closes.length === 1 ? await d.board.get(cr.closes[0]).catch(() => void 0) : void 0;
  const areas = [b.paths.lane_areas ?? []].flat();
  const inArea = areas.length > 0 && (diff === void 0 ? [] : diffPaths(diff) ?? []).some((p) => matchesAny(p, areas));
  return !inArea && String(item?.fields?.lane ?? "").toLowerCase() === "fast" ? "product-fast" : "product-full";
}
function approvalNeed(b, klass) {
  const mode = b.forge.human_approval ?? "full-lane";
  if (klass === "guardrail") return "owner";
  if (klass === "tuning") return (b.learning?.auto_merge_classes ?? []).includes("tuning") ? "none" : "owner";
  return mode === "always" || mode === "full-lane" && klass === "product-full" ? "human" : "none";
}
async function approvalWho(d, cr) {
  const klass = await approvalClass(d, cr, await readDiff(d, cr.n));
  const need3 = approvalNeed(d.binding, klass);
  const o = ownersFor(d.binding.owners, "forge");
  return { class: klass, who: need3 === "owner" ? o.factory : need3 === "human" ? o.product : [] };
}
async function approval(d, n) {
  const b = d.binding;
  const cr = await d.forge.view(n);
  const klass = await approvalClass(d, cr, await readDiff(d, n));
  const o = ownersFor(b.owners, "forge");
  const bots = [...o.bots, b.forge.review_identity].filter(Boolean).map((u) => u.toLowerCase());
  const owner = o.factory.map((u) => u.toLowerCase());
  const need3 = approvalNeed(b, klass);
  let by;
  if (need3 !== "none") {
    const reviews = await d.forge.approvals(n);
    const member = new Set(reviews.filter((r) => !!r.assoc && ["OWNER", "MEMBER", "COLLABORATOR"].includes(r.assoc)).map((r) => r.user.toLowerCase()));
    const ok = approvers(reviews, cr.headSha).filter((u) => member.has(u));
    by = need3 === "owner" ? ok.find((u) => owner.includes(u)) : ok.find((u) => !bots.includes(u));
  }
  const pass = need3 === "none" || !!by;
  const description = need3 === "none" ? `${klass}: no human approval needed` : pass ? `${klass}: approved by ${by}` : `${klass}: waits for an approval of the head by ${need3 === "owner" ? "owners.factory" : "a human"}`;
  await d.forge.status(cr.headSha, { context: "human-approval", state: pass ? "success" : "pending", description });
  return { cr: cr.n, class: klass, need: need3, state: pass ? "success" : "pending", ...by ? { by } : {} };
}
async function review(d, n) {
  const b = d.binding;
  if (b.forge.review_identity) return { cr: n, skipped: "two identities: forge verdict posts the review status" };
  const cr = await d.forge.view(n);
  const [report2] = selectComments((await d.forge.comments(n)).reverse(), { owners: ownersFor(b.owners, "forge"), trusted: true, marker: matches("verdict", cr.headSha) });
  const verdict2 = verdictOf(report2?.body ?? "");
  const state = verdict2 === "PASS" ? "success" : verdict2 ? "failure" : "pending";
  const description = verdict2 === "CONFLICT" ? "review: the report holds conflicting verdicts" : verdict2 ? `review: ${verdict2}` : "waits for a trusted verdict report on this head";
  await d.forge.status(cr.headSha, { context: b.forge.review_check_name ?? "review", state, description, ...report2?.url ? { url: report2.url } : {} }, { as: "ci" });
  return { cr: cr.n, state, ...verdict2 ? { verdict: verdict2 } : {} };
}
function trailers(message) {
  const out = {};
  const paras = message.replace(/\r/g, "").trimEnd().split(/\n[ \t]*\n/);
  if (paras.length < 2) return out;
  for (const line of paras[paras.length - 1].split("\n")) {
    const m = TRAILER_LINE.exec(line);
    if (m) (out[m[1].toLowerCase()] ??= []).push(m[2]);
  }
  return out;
}
async function provenance(d, n) {
  const mode = d.binding.forge.provenance ?? "off";
  if (mode === "off") return { cr: n, mode, skipped: "forge.provenance is off" };
  const bots = new Set(ownersFor(d.binding.owners, "forge").bots.map((u) => u.toLowerCase()));
  const cr = await d.forge.view(n);
  let list;
  let why = "";
  try {
    list = await d.forge.commits(n);
  } catch (e) {
    why = String(e.message ?? e).split("\n")[0];
  }
  const missing = [];
  const commits = (list ?? []).map((c) => {
    const sha2 = c.sha.slice(0, 12);
    const names = [c.author || c.authorName, c.committer || c.committerName].map((u) => u.toLowerCase());
    if (c.parents > 1 && FORGE_WEB.has(c.committer.toLowerCase())) return { sha: sha2, by: "merge", ok: true };
    if (!names.some((u) => bots.has(u))) return { sha: sha2, by: "human", ok: true };
    const t = trailers(c.message);
    const run = trailerValue(t, "agent-run"), model = trailerValue(t, "agent-model");
    if (!run) missing.push(`${sha2}: Agent-Run trailer ${t["agent-run"] ? "is malformed" : "is missing"}`);
    if (!model) missing.push(`${sha2}: Agent-Model trailer ${t["agent-model"] ? "is malformed" : "is missing"}`);
    return { sha: sha2, by: "agent", ...run ? { run } : {}, ...model ? { model } : {}, ok: !!run && !!model };
  });
  if (!list) missing.push(`commits unreadable: ${why || "unknown"}`);
  const agentCommits = commits.filter((c) => c.by === "agent").length;
  const humanCommits = commits.filter((c) => c.by === "human").length;
  const ok = !missing.length;
  const state = mode === "require" && !ok ? "failure" : "success";
  const description = !list ? `commits unreadable (${mode})` : `${agentCommits} agent, ${humanCommits} human commits; ${missing.length ? `${missing.length} trailer problems` : "all agent commits carry trailers"} (${mode})`;
  await d.forge.status(cr.headSha, { context: "agent-provenance", state, description: description.slice(0, 140) }, { as: "ci" });
  return { cr: cr.n, mode, state, ok, commits, agentCommits, humanCommits, missing, ...state === "failure" ? { errors: missing } : {} };
}
function onlyNoProof(b, diff) {
  const globs = [b.paths?.no_proof ?? []].flat();
  const paths = diff === void 0 ? void 0 : diffPaths(diff);
  return globs.length > 0 && !!paths?.length && paths.every((p) => matchesAny(p, globs));
}
function proofFiles(diff, isProof) {
  const out = [];
  for (const block of diff.split(/^(?=diff --git )/m)) {
    if (!block.startsWith("diff --git ") || /^deleted file mode/m.test(block)) continue;
    const path = diffPaths(block.split("\n")[0])?.[1];
    if (path && isProof.test(path) && !out.includes(path)) out.push(path);
  }
  return out;
}
async function proofsOnBase(d, n) {
  const cr = await d.forge.view(n);
  const diff = await readDiff(d, n);
  const cls = await classify(d, cr, diff);
  const tpl = d.binding.commands?.proofs_on_base;
  const files = cls === "product" && diff !== void 0 ? proofFiles(diff, rule(d.binding, "proof_pattern", PROOF_FILE)) : [];
  const passedOnBase = [];
  let error;
  const noProof = cls === "product" && !files.length && onlyNoProof(d.binding, diff);
  if (cls !== "product" || noProof) error = void 0;
  else if (!tpl) error = "commands.proofs_on_base is not set";
  else if (!files.length) error = "no new or changed proof file";
  else if (!d.run) error = "no command runner";
  else {
    const head = await d.vcs.head();
    const base = (await d.vcs.base()).sha;
    try {
      await d.vcs.checkoutTests(base, files);
      for (const f of files) if (d.run(fill(tpl, { files: f }))) passedOnBase.push(f);
    } finally {
      await d.vcs.checkoutTests(head.sha, []);
    }
    if (passedOnBase.length) error = `passes on the merge base: ${passedOnBase.join(", ")}`;
  }
  const description = cls !== "product" ? `${cls}: no product proof` : noProof ? "only paths.no_proof changed: no proof needed" : error ?? `${files.length} proof file(s) fail on the merge base`;
  let posted = true;
  try {
    await d.forge.status(cr.headSha, { context: "proofs-on-base", state: error ? "failure" : "success", description: description.slice(0, 140) }, { as: "ci" });
  } catch {
    posted = false;
  }
  return { ok: !error, cr: cr.n, class: cls, files, passedOnBase, posted, errors: error ? [error] : [] };
}
async function merged(d, sha2) {
  const b = d.binding.board;
  const opts = shippedOptions(d.binding.product.environments, d.binding.product.delivery);
  const cr = await d.forge.viewBySha(sha2).catch((e) => {
    if (/no change request for/.test(e.message)) return void 0;
    throw e;
  });
  const none = (reason) => ({ cr: cr?.n, sha: sha2, moved: [], reason });
  if (!cr?.n) return none("no CR merged at this sha");
  if (cr.state !== "merged") return none(`CR ${cr.n} is not merged`);
  if (cr.target !== d.binding.vcs.trunk) return none(`target ${cr.target} is not trunk ${d.binding.vcs.trunk}`);
  if (cr.closes.length !== 1) return none(`CR closes ${cr.closes.length} tickets, not exactly one`);
  const id = cr.closes[0];
  const it = await d.board.get(id);
  if (it.status === "Cancelled") return none(`${id} is Cancelled`);
  if (!b.done_statuses.includes(it.status)) {
    try {
      await d.board.move(id, "Done", it.status);
    } catch (e) {
      if (!b.done_statuses.includes((await d.board.get(id)).status)) throw e;
    }
  }
  if (!(await d.board.get(id)).fields?.shipped) await d.board.set(id, "shipped", opts[0]);
  return { cr: cr.n, sha: sha2, moved: [id] };
}
async function mergeShas(d, ids) {
  const out = /* @__PURE__ */ new Map();
  if (d.forge.closing) for (const id of ids) {
    const s = (await d.forge.closing(id)).map((c) => c.mergeSha);
    if (s.length) out.set(id, s);
  }
  const rest = ids.filter((id) => !out.has(id));
  const merged2 = rest.length ? await d.forge.list({ state: "merged" }) : [];
  for (const id of rest) out.set(id, merged2.filter((c) => c.closes.includes(id)).map((c) => c.mergeSha));
  return out;
}
async function shipped(d, env, sha2, result, version3) {
  const envs = d.binding.product.environments;
  const i = envs.indexOf(env);
  if (i < 0) throw new UsageError(`unknown environment ${env}; one of ${envs.join(", ")}`);
  if (!["success", "failure", "rolled-back"].includes(result)) throw new UsageError("--result must be success|failure|rolled-back");
  const opts = shippedOptions(envs, d.binding.product.delivery);
  const rank = (s) => opts.indexOf(s || opts[0]);
  const target = `On ${env}`;
  const last = i === envs.length - 1;
  const done = (await d.board.list({ status: ["Done", "In review"] })).filter((x) => x.status === "Done" || x.status === "In review");
  const changed = [];
  const signal = async (held) => {
    const title = `Deploy to ${env} failed at ${sha2.slice(0, 12)}`;
    if ((await d.board.list({ label: "signal:deploy" })).some((x) => x.title === title && !d.binding.board.done_statuses.includes(x.status))) return false;
    const envLabel = (d.binding.board.env_labels ?? []).find((l) => l === `env:${env}`);
    await d.board.create({
      title,
      body: `Deploy to ${env} failed.
sha: ${sha2}
environment: ${env}`,
      status: "Signals",
      labels: ["signal:deploy", ...envLabel ? [envLabel] : [], ...held ? [d.binding.board.labels.human] : []]
    });
    return true;
  };
  if (result === "success") {
    const isAnc = d.isAncestor;
    if (!isAnc) return { env, result, changed, tags: [], unknown: true };
    const unmatched = [];
    const unknown = [];
    const rel = d.binding.board.labels?.release;
    const items = [];
    const todo = done.filter((x) => rank(x.fields.shipped) < rank(target));
    const byId = await mergeShas(d, todo.map((x) => x.id));
    for (const x of todo) {
      const shas = byId.get(x.id) ?? [];
      if (!shas.length) {
        if (x.status === "Done" && !(rel && x.labels.includes(rel))) unmatched.push(x.id);
        continue;
      }
      const anc = shas.map((s) => s ? isAnc(s, sha2) : void 0);
      if (anc.includes(void 0)) {
        unknown.push(x.id);
        continue;
      }
      if (anc.every(Boolean)) items.push(x);
    }
    if (version3) {
      for (const x of items) if (x.fields.release_version !== version3) {
        await d.board.set(x.id, "release_version", version3);
        x.fields.release_version = version3;
      }
    }
    const tags = [];
    if (last) {
      const prefix = d.binding.vcs.tag_prefix;
      const have = new Set((await d.vcs.tags(prefix)).map((t) => t.name));
      for (const v of new Set(items.map((x) => x.fields.release_version).filter((v2) => !!v2))) {
        if (!have.has(`${prefix}${v}`)) await d.vcs.tag(`${prefix}${v}`, sha2);
        tags.push(`${prefix}${v}`);
      }
    }
    for (const x of items) {
      const now = await d.board.get(x.id);
      if (rank(now.fields.shipped) >= rank(target)) continue;
      if (!d.binding.board.done_statuses.includes(now.status)) await d.board.move(x.id, "Done", now.status);
      await d.board.set(x.id, "shipped", target);
      changed.push(x.id);
    }
    return { env, result, changed, tags, unmatched, ...unknown.length ? { unknown } : {} };
  }
  if (result === "rolled-back") {
    const back = i > 0 ? `On ${envs[i - 1]}` : opts[0];
    const isAnc = d.isAncestor;
    if (!isAnc) return { env, result, changed, unknown: true };
    const next = i + 1 < envs.length ? rank(`On ${envs[i + 1]}`) : Infinity;
    const back_ = done.filter((x) => x.status === "Done" && rank(x.fields.shipped) >= rank(target) && rank(x.fields.shipped) < next);
    const byId = await mergeShas(d, back_.map((x) => x.id));
    for (const x of back_) {
      const shas = byId.get(x.id) ?? [];
      const anc = shas.map((s) => s ? isAnc(s, sha2) : void 0);
      if (!shas.length || anc.includes(void 0) || anc.every(Boolean)) continue;
      const now = rank((await d.board.get(x.id)).fields.shipped);
      if (now < rank(target) || now >= next) continue;
      await d.board.set(x.id, "shipped", back);
      changed.push(x.id);
    }
    return { env, result, changed };
  }
  if (last) {
    const back = i > 0 ? `On ${envs[i - 1]}` : opts[0];
    const isAnc = d.isAncestor;
    if (isAnc) {
      const cut = done.filter((x) => x.status === "Done" && x.fields.release_version && rank(x.fields.shipped) < rank(target));
      const byId = await mergeShas(d, cut.map((x) => x.id));
      for (const x of cut) {
        const shas = byId.get(x.id) ?? [];
        if (!shas.length || shas.some((s) => !s || isAnc(s, sha2) !== true)) continue;
        const now = (await d.board.get(x.id)).fields;
        if (rank(now.shipped) >= rank(target) || now.release_version !== x.fields.release_version) continue;
        await d.board.set(x.id, "shipped", back);
        await d.board.set(x.id, "release_version", null);
        changed.push(x.id);
      }
    }
  }
  const opened = await signal(last);
  return { env, result, changed, signal: opened };
}
async function signalOnRed(d, id) {
  const run = await d.forge.run(id);
  if (run.state !== "failure") return { created: false, reason: `run ${redact(id, 40)} did not fail (${redact(run.state, 20)})` };
  const v = d.binding.vcs;
  if (run.ref !== v.trunk && !(v.release_prefix && run.ref.startsWith(v.release_prefix))) return { created: false, reason: `ref ${redact(run.ref, 100)} is not trunk or a release line` };
  const title = redact(`CI red: ${run.name} @ ${run.ref} (run ${run.id})`, 1e3).replace(/[^A-Za-z0-9 ._/:@()-]/g, "").slice(0, 100);
  const existing = await d.board.list({ label: "signal:ci" });
  if (existing.some((x) => x.title === title)) return { created: false };
  const item = await d.board.create({
    title,
    body: `run: ${redact(run.name)}
ref: ${redact(run.ref)}
sha: ${redact(run.sha, 40)}
url: ${cleanUrl(run.url)}`,
    status: "Signals",
    labels: ["signal:ci"]
  });
  return { created: true, id: item.id };
}
function cliVerbs() {
  const out = { board: new Set(Object.keys(VERBS)), forge: new Set(Object.keys(VERBS3)), vcs: new Set(Object.keys(VERBS2)) };
  for (const g of ["gate", "ledger", "bench"]) out[g] = new Set(GROUPS[g][2].split(":")[0].split(/\s+/).filter((w) => /^[a-z][a-z-]*$/.test(w)));
  return out;
}
function cliFlags(group, verb) {
  const table = { board: VERBS, forge: VERBS3, vcs: VERBS2 }[group];
  if (table) {
    const v = table[verb];
    return /* @__PURE__ */ new Set([...v?.value ?? [], ...v?.bool ?? []]);
  }
  if (group === "ledger") return new Set(Object.keys(OPTIONS2));
  if (group === "bench") return new Set(Object.keys(OPTIONS3));
  if (group === "dispatch") return new Set(FLAGS);
  return void 0;
}
function cliCalls(text) {
  const out = [];
  const re = /`(?:agentic-sdlc\s+)?(board|forge|vcs|gate|ledger|bench|dispatch)\s+([a-z][a-z0-9-]*(?:\/[a-z][a-z0-9-]*)?)([^`]*)`/g;
  for (const m of text.matchAll(re)) out.push({ group: m[1], verb: m[2], rest: m[3], line: text.slice(0, m.index).split("\n").length });
  return out;
}
function skillPackCheck(dir, rel) {
  const pack = readSkills(dir);
  const errors = [...pack.errors], warnings = [...pack.warnings];
  const verbs = cliVerbs();
  const ids = new Set(pack.steps.map((x) => x.id));
  for (const sk of pack.skills) for (const f of mdFiles(sk.dir)) {
    const file = join8(sk.dir, f), name = `${sk.name}/${f}`;
    const text = readFileSync7(file, "utf8");
    const at = (line) => `${relative5(rel, file).replaceAll("\\", "/")}:${line}`;
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const link = m[1].split("#")[0];
      if (!link || /^[a-z][a-z0-9+.-]*:/i.test(link)) continue;
      if (!existsSync6(resolve3(dirname3(file), link))) errors.push(`${f === "SKILL.md" ? sk.name : name}: broken link ${m[1]}`);
    }
    for (const h of forbiddenHits(text)) errors.push(`${at(h.line)}: forbidden '${h.match}' (${h.reason})`);
    for (const c of cliCalls(text)) {
      if (c.group === "dispatch") {
        if (!ids.has(c.verb)) errors.push(`${at(c.line)}: 'dispatch ${c.verb}' is not a step id (${[...ids].join(" ")})`);
      } else if (!verbs[c.group].has(c.verb)) {
        errors.push(`${at(c.line)}: '${c.group} ${c.verb}' is not a verb (${c.group}: ${[...verbs[c.group]].join(" ")})`);
        continue;
      }
      const known = cliFlags(c.group, c.verb);
      if (known) {
        for (const m of c.rest.matchAll(/(?<![\w-])--([a-z][a-z-]*)/g))
          if (!known.has(m[1])) errors.push(`${at(c.line)}: '--${m[1]}' is not a flag of '${c.group} ${c.verb}' (${[...known].map((k) => `--${k}`).join(" ") || "none"})`);
      }
    }
  }
  return { errors, warnings, pack };
}
function skillRegression(root) {
  const dir = join8(root, ".agents", "skills");
  if (!existsSync6(dir)) return { errors: [`${dir} does not exist`], warnings: [] };
  const { errors, warnings, pack } = skillPackCheck(dir, root);
  const sdir = join8(root, ".agents", "scorers");
  const targets = scorerTargets(pack);
  if (existsSync6(sdir)) for (const f of readdirSync4(sdir).filter((n) => n.endsWith(".md"))) errors.push(...scorerErrors(f, readFileSync7(join8(sdir, f), "utf8"), targets));
  return { errors, warnings };
}
function scorerErrors(f, text, targets) {
  let fm;
  try {
    fm = (0, import_yaml4.parse)(/^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "");
  } catch {
    return [`scorers/${f}: frontmatter is not YAML`];
  }
  if (!fm || typeof fm !== "object") return [`scorers/${f}: no frontmatter`];
  const errors = [];
  if (typeof fm.name !== "string" || !fm.name) errors.push(`scorers/${f}: frontmatter name missing`);
  const at = fm.applies_to;
  if (at !== "*" && !(Array.isArray(at) && at.length && at.every((s) => typeof s === "string" && s))) errors.push(`scorers/${f}: applies_to must be "*" or a list of step ids or skills`);
  else if (Array.isArray(at)) {
    for (const t of at) if (!targets.has(t)) errors.push(`scorers/${f}: applies_to '${t}' names no step or skill (steps: ${[...targets].join(", ")})`);
  }
  if (!["pass-fail", "0-4"].includes(fm.scale)) errors.push(`scorers/${f}: scale ${fm.scale} invalid`);
  return errors;
}
function depsOf(base) {
  const ctxOf = (options) => ({ ...base, options });
  const b = base.binding;
  const d = {
    binding: b,
    root: base.root,
    board: createBoard(ctxOf(b.board.options)),
    forge: createForge(ctxOf(b.forge.options)),
    vcs: createVcs(ctxOf(b.vcs.options ?? {}))
  };
  const git2 = (args) => base.exec("git", args, { cwd: base.root });
  d.run = proofRunner((cmd) => shell(base.exec, cmd, base.root));
  d.fileAt = (path, sha2) => {
    try {
      return git2(["show", `${sha2}:${path}`]);
    } catch {
      return void 0;
    }
  };
  d.isAncestor = (x, y) => {
    try {
      git2(["merge-base", "--is-ancestor", x, y]);
      return true;
    } catch (e) {
      return e.status === 1 ? false : void 0;
    }
  };
  return d;
}
var import_yaml4, matchesAny, factoryGlobs, TUNING_KEYS, SKILL_MD, TIERS3, tiersOf, withoutTier, tiersValid, nameHas, readDiff, DEPENDENCY_LINES, DEPENDENCY_BOTS, TRAILER_LINE, TRAILER_VALUE, trailerValue, FORGE_WEB, redact, cleanUrl, mdFiles, cli6;
var init_gates = __esm({
  "src/gates.ts"() {
    "use strict";
    import_yaml4 = __toESM(require_dist(), 1);
    init_ports();
    init_binding();
    init_bench();
    init_util();
    init_board();
    init_forge();
    init_vcs();
    init_cli();
    init_comments();
    init_skills();
    init_bench();
    init_ledger();
    init_dispatch();
    init_telemetry();
    matchesAny = (path, globs) => globs.some((g) => globToRegExp(g).test(path));
    factoryGlobs = (b) => b.paths.factory ?? [];
    TUNING_KEYS = ["models"];
    SKILL_MD = /^\.agents\/skills\/([^/]+)\/SKILL\.md$/;
    TIERS3 = TIER_NAMES;
    tiersOf = (fm) => ({ tier: fm.metadata?.tier, steps: Object.fromEntries(Object.entries(fm.metadata?.steps ?? {}).map(([k, v]) => [k, v?.tier])) });
    withoutTier = (fm) => ({
      ...fm,
      metadata: { ...fm.metadata, tier: void 0, ...fm.metadata?.steps && typeof fm.metadata.steps === "object" ? { steps: Object.fromEntries(Object.entries(fm.metadata.steps).map(([k, v]) => [k, { ...v, tier: void 0 }])) } : {} }
    });
    tiersValid = (fm) => {
      const t = tiersOf(fm);
      return [t.tier, ...Object.values(t.steps)].every((x) => x === void 0 || TIERS3.includes(x)) && (t.tier !== void 0 || Object.keys(t.steps).length > 0);
    };
    nameHas = (s, id) => new RegExp(`(^|[^A-Za-z0-9])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9])`, "i").test(s);
    readDiff = (d, n) => d.forge.diff(n).catch(() => void 0);
    DEPENDENCY_LINES = /^(dependabot|renovate)\//;
    DEPENDENCY_BOTS = /^((app\/)?(dependabot|renovate)(\[bot\])?|renovate-bot)$/i;
    TRAILER_LINE = /^([A-Za-z][A-Za-z0-9-]*):[ \t]+(\S.*?)[ \t]*$/;
    TRAILER_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:/@+#[\]-]{0,127}$/;
    trailerValue = (t, key) => {
      const v = [...new Set(t[key] ?? [])];
      return v.length === 1 && TRAILER_VALUE.test(v[0]) ? v[0] : void 0;
    };
    FORGE_WEB = /* @__PURE__ */ new Set(["web-flow"]);
    redact = (s, max = 120) => String(s ?? "").replace(/[\x00-\x1f]/g, " ").replace(/\b[A-Za-z0-9_+/=-]{32,}\b/g, "[redacted]").slice(0, max);
    cleanUrl = (u) => redact(String(u ?? "").replace(/^(\w+:\/\/)[^/@]*@/, "$1").replace(/[?#].*$/, ""), 200);
    mdFiles = (dir) => readdirSync4(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? mdFiles(join8(dir, e.name)).map((f) => `${e.name}/${f}`) : e.name.endsWith(".md") ? [e.name] : []);
    cli6 = (argv, base) => guard(async () => {
      const [gate, ...rest] = argv;
      const a = parseArgs(rest, ["stdin-prepush"]);
      const deps = () => depsOf(base);
      const fail = (r) => {
        if (r.errors?.length) throw new Error(r.errors.join("\n"));
        return r;
      };
      switch (gate) {
        case "branch-names": {
          let names;
          if (a.has("stdin-prepush")) {
            names = readFileSync7(0, "utf8").split("\n").map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 4 && !/^0+$/.test(p[1]) && p[2].startsWith("refs/heads/")).map((p) => p[2].slice("refs/heads/".length));
          } else names = [a.get("ref") ?? (await deps().vcs.head()).ref];
          const bad = branchNames(base.binding, names);
          if (bad.length) throw new Error(`branch name not allowed: ${bad.join(", ")}`);
          return { ok: true, names };
        }
        case "linkage":
          return fail(await linkage(deps(), a.need("cr")));
        case "merged": {
          const sha2 = a.need("sha");
          const r = await merged(deps(), sha2);
          if (r.cr && !r.reason) await emitGateEvent(base, changeMergedEvent(base.binding, { cr: r.cr, sha: sha2 }));
          return r;
        }
        case "shipped": {
          if (!a.pos[0]) throw new UsageError("shipped <env> is required");
          const sha2 = a.need("sha"), result = a.need("result"), version3 = a.get("version");
          const r = await shipped(deps(), a.pos[0], sha2, result, version3);
          await emitGateEvent(base, deployEvent(base.binding, { env: a.pos[0], sha: sha2, result, version: version3 }));
          return r;
        }
        case "approval": {
          const r = await approval(deps(), a.need("cr"));
          return r;
        }
        case "review":
          return review(deps(), a.need("cr"));
        case "provenance": {
          const r = await provenance(deps(), a.need("cr"));
          if ("errors" in r && r.errors?.length) process.stdout.write(JSON.stringify(r) + "\n");
          return fail(r);
        }
        case "proofs-on-base":
          return fail(await proofsOnBase(deps(), a.need("cr")));
        case "evidence": {
          const sha2 = a.need("sha");
          const kinds = base.binding.product.evidence ?? [];
          if (!kinds.length) return { ok: true, kinds, reason: "product.evidence is empty" };
          const cmd = base.binding.commands?.evidence_check;
          if (!cmd) throw new Error("product.evidence is set but commands.evidence_check is unset");
          shell(base.exec, fill(cmd, { sha: sha2 }), base.root);
          return { ok: true, kinds, sha: sha2 };
        }
        case "signal-on-red":
          return signalOnRed(deps(), a.need("run"));
        case "skill-regression": {
          const { errors, warnings } = skillRegression(base.root);
          for (const w of warnings) process.stderr.write(`warning: ${w}
`);
          if (errors.length) throw new Error(errors.join("\n"));
          return { ok: true, warnings };
        }
        default:
          throw new UsageError(`unknown gate: ${gate ?? ""}`);
      }
    });
  }
});

// src/forge/index.ts
var forge_exports = {};
__export(forge_exports, {
  GATE_CONTEXTS: () => GATE_CONTEXTS,
  VERBS: () => VERBS3,
  cli: () => cli7,
  createForge: () => createForge
});
function createForge(ctx) {
  const make = adapters2[ctx.binding.forge.adapter];
  if (!make) throw new Error(`unknown forge adapter: ${ctx.binding.forge.adapter}`);
  return make(ctx);
}
var GATE_CONTEXTS, adapters2, VERBS3, cli7;
var init_forge = __esm({
  "src/forge/index.ts"() {
    "use strict";
    init_ports();
    init_comments();
    init_flow();
    init_util();
    init_github2();
    GATE_CONTEXTS = ["human-approval", "ticket-linkage", "proofs-on-base", "agent-provenance"];
    adapters2 = { github };
    VERBS3 = {
      open: { value: ["source", "title", "body-file"], bool: ["draft"] },
      view: { value: ["sha"] },
      diff: {},
      list: { value: ["state", "limit", "since"], bool: ["checks"], num: ["limit"] },
      ready: {},
      draft: {},
      sync: {},
      automerge: {},
      cut: {},
      comment: { value: ["body-file", "kind", "ref"] },
      comments: { value: ["last", "marker", "author", "kind", "ref"], bool: ["trusted"], num: ["last"] },
      verdict: { value: ["body-file"], bool: ["pass", "fail"] },
      land: { value: ["wait"], num: ["wait"] },
      queue: {},
      status: { value: ["state", "context", "description", "url"] },
      approve: {},
      approvals: {},
      runs: { value: ["ref"], bool: ["failed"] },
      run: {}
    };
    cli7 = (argv, ctx) => guard(async () => {
      const [verb, ...rest] = argv;
      if (!verb || !Object.hasOwn(VERBS3, verb)) throw new UsageError(`unknown forge verb: ${verb ?? ""}`);
      const a = parseStrict("forge", verb, rest, VERBS3[verb]);
      const f = createForge({ ...ctx, options: ctx.binding.forge.options });
      const n = () => {
        if (!a.pos[0]) throw new UsageError(`forge ${verb}: argument is required`);
        return a.pos[0];
      };
      const body = () => bodyFile(a);
      switch (verb) {
        case "open":
          return f.open({ source: a.need("source"), title: a.need("title"), body: body(), draft: a.has("draft") });
        case "view":
          return a.has("sha") ? f.viewBySha(a.get("sha")) : f.view(n());
        case "diff":
          return f.diff(n());
        case "list": {
          const limit = a.get("limit"), since = a.get("since");
          if (limit !== void 0 && !/^[1-9]\d*$/.test(limit)) throw new UsageError("--limit must be a positive integer");
          if (since !== void 0 && Number.isNaN(Date.parse(since))) throw new UsageError("--since must be an ISO date");
          return f.list({ state: a.get("state") ?? "open", limit: limit ? Number(limit) : void 0, since, checks: a.has("checks") });
        }
        case "ready":
          return f.ready(n());
        case "draft":
          return f.draft(n());
        case "sync":
          return f.sync(n());
        case "automerge":
          return f.automerge(n());
        case "cut": {
          if (!a.pos[1]) throw new UsageError("forge cut <revision> <version>");
          return f.cut(a.pos[0] ?? "", a.pos[1]);
        }
        case "comment": {
          if (a.has("ref") && !a.has("kind")) throw new UsageError("forge comment: --ref needs --kind");
          const text = a.has("kind") ? stampBody(body(), parseWritableKind(a.get("kind")), a.get("ref"), { specMarker: ctx.binding.spec_marker }) : body();
          return f.comment(n(), text);
        }
        case "verdict": {
          if (a.has("pass") === a.has("fail")) throw new UsageError("forge verdict: exactly one of --pass or --fail");
          return verdict(f, { ...ctx, options: ctx.binding.forge.options }, n(), a.has("pass"), body());
        }
        case "land": {
          const { depsOf: depsOf2, approvalWho: approvalWho2 } = await Promise.resolve().then(() => (init_gates(), gates_exports));
          const d = depsOf2(ctx);
          return land(f, ctx.binding, n(), a.get("wait") === void 0 ? void 0 : Number(a.get("wait")), (cr) => approvalWho2(d, cr));
        }
        case "queue": {
          const { depsOf: depsOf2, approvalWho: approvalWho2 } = await Promise.resolve().then(() => (init_gates(), gates_exports));
          const d = depsOf2(ctx);
          const open = async (id) => !ctx.binding.board.done_statuses.includes((await d.board.get(id)).status);
          const held = async (id) => (await d.board.get(id)).labels.includes(ctx.binding.board.labels.human);
          return queue(f, ctx.binding, (cr) => approvalWho2(d, cr), Date.now(), open, held);
        }
        case "comments": {
          if (a.has("kind") && a.has("marker")) throw new UsageError("forge comments: --kind and --marker together");
          if (a.has("ref") && !a.has("kind")) throw new UsageError("forge comments: --ref needs --kind");
          const marker = a.has("kind") ? matches(parseKind(a.get("kind")), a.get("ref"), { specMarker: ctx.binding.spec_marker }) : a.get("marker");
          return selectComments((await f.comments(n())).reverse(), {
            owners: ownersFor(ctx.binding.owners, "forge"),
            authors: a.all("author"),
            trusted: a.has("trusted"),
            last: a.get("last") ? Number(a.get("last")) : void 0,
            marker
          });
        }
        case "status": {
          const state = a.need("state");
          if (GATE_CONTEXTS.includes(a.need("context"))) throw new UsageError(`context '${a.need("context")}' is posted only by its gate`);
          if (!["pending", "success", "failure"].includes(state)) throw new UsageError("--state must be pending|success|failure");
          await f.status(n(), { context: a.need("context"), state, description: a.need("description"), url: a.get("url") });
          return {};
        }
        case "approve":
          await f.approve(n());
          return {};
        case "approvals":
          return f.approvals(n());
        case "run":
          return f.run(n());
        case "runs":
          return f.runs({ ref: a.get("ref"), failed: a.has("failed") });
        default:
          throw new UsageError(`unknown forge verb: ${verb}`);
      }
    });
  }
});

// src/pristine.ts
import { createHash as createHash3 } from "crypto";
import { existsSync as existsSync7, readdirSync as readdirSync5, readFileSync as readFileSync8 } from "fs";
import { posix } from "path";
import { join as join9 } from "path";
function bindWorkflow(name, text, v) {
  if (name === "agentic-sdlc-delivery.yml")
    return text.replace(/^(\s+TRUNK: )\S+(?=\s+# set:)/m, `$1${v.trunk}`).replace(/^(\s+RELEASE_PREFIX: )\S+(?=\s+# set:)/m, `$1${v.releasePrefix}`).replace(/^(\s+DELIVERY: )\S+(?=\s+# set:)/m, `$1${v.delivery}`).replace(/(# set: your vcs\.trunk\n\s+branches: )\[[^\]]*\]/, `$1[${v.trunk}]`);
  if (name === "agentic-sdlc-verify.yml")
    return text.replace(/^(\s+run: ).*?(?=\s+# set: the binding's commands\.install)/gm, (_, a) => a + yamlScalar(v.install)).replace(/^(\s+run: ).*?(?=\s+# set: the binding's commands\.verify)/gm, (_, a) => a + yamlScalar(v.verify));
  return text;
}
function renameSkill(rel, text, dir, names) {
  const swap = (seg) => dir === "to" ? names.has(seg) && seg !== "sdlc" ? COPY_PREFIX + seg : seg : seg.startsWith(COPY_PREFIX) && seg.length > COPY_PREFIX.length ? seg.slice(COPY_PREFIX.length) : seg;
  const parts = posix.normalize(rel.replaceAll("\\", "/")).split("/");
  const here = parts[0], moved = swap(here);
  let out = text.replace(/\]\(([^)\s#]+)((?:#[^)\s]*)?)\)/g, (m, target, anchor) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("/")) return m;
    const abs = posix.normalize(posix.join(posix.dirname(parts.join("/")), target));
    const seg = abs.split("/");
    if (seg[0] === ".." || seg[0] === ".") return m;
    const to = [swap(seg[0]), ...seg.slice(1)].join("/");
    const relTo = posix.relative(posix.dirname([moved, ...parts.slice(1)].join("/")), to);
    const keepDot = target.startsWith("./") && !relTo.startsWith(".");
    return `](${keepDot ? "./" : ""}${relTo}${anchor})`;
  });
  if (parts.length === 2 && parts[1] === "SKILL.md")
    out = out.replace(/^(---\r?\n(?:[^\n]*\r?\n)*?name:[ \t]*)\S+/, `$1${moved}`);
  return out;
}
function releasedHash(name, data, rel) {
  if (name === "agentic-sdlc-delivery.yml" || name === "agentic-sdlc-verify.yml") return sha(bindWorkflow(name, data.toString("utf8"), DEFAULTS));
  const m = rel && name.endsWith(".md") ? SKILL_ROOT.exec(rel.replaceAll("\\", "/")) : null;
  return sha(m ? renameSkill(m[2], data.toString("utf8"), "from", /* @__PURE__ */ new Set()) : data);
}
function oneIdentityRuleset(text) {
  const rs = JSON.parse(text);
  for (const r of rs.rules) if (r.type === "pull_request") Object.assign(r.parameters, { required_approving_review_count: 0, require_last_push_approval: false });
  for (const r of rs.rules) if (r.type === "required_status_checks") {
    for (const c of r.parameters.required_status_checks) if (["review", "human-approval"].includes(c.context)) c.integration_id = 15368;
  }
  return JSON.stringify(rs, null, 2) + "\n";
}
function knownHashes(pkg) {
  const f = join9(pkg, "templates", "known-hashes.json");
  return new Set(existsSync7(f) ? JSON.parse(readFileSync8(f, "utf8")) : []);
}
var sha, DEFAULTS, yamlScalar, COPY_PREFIX, skillNames, SKILL_ROOT;
var init_pristine = __esm({
  "src/pristine.ts"() {
    "use strict";
    sha = (data) => createHash3("sha256").update(data).digest("hex");
    DEFAULTS = { trunk: "main", releasePrefix: "release/", delivery: "release-line", install: "npm ci", verify: "npm test" };
    yamlScalar = (v) => /^[\w./ -]+$/.test(v) ? v : JSON.stringify(v);
    COPY_PREFIX = "sdlc-";
    skillNames = (skillsDir) => new Set(existsSync7(skillsDir) ? readdirSync5(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : []);
    SKILL_ROOT = /^(\.agents\/skills|\.claude\/skills)\/(.+)$/;
  }
});

// src/install.ts
var install_exports = {};
__export(install_exports, {
  cli: () => cli8,
  cliPin: () => cliPin,
  cloudBoard: () => cloudBoard,
  deliveryWorkflow: () => deliveryWorkflow,
  implementerToken: () => implementerToken,
  missingBindingKeys: () => missingBindingKeys,
  packageRoot: () => packageRoot,
  probeFailure: () => probeFailure,
  redact: () => redact2,
  selfHostedRunner: () => selfHostedRunner,
  trunkProtection: () => trunkProtection,
  unpinnedActions: () => unpinnedActions,
  validate: () => validate
});
import { execFileSync as execFileSync2 } from "child_process";
import { chmodSync as chmodSync2, existsSync as existsSync8, mkdirSync as mkdirSync4, readFileSync as readFileSync9, readdirSync as readdirSync6, rmSync as rmSync3, rmdirSync, statSync, writeFileSync as writeFileSync5 } from "fs";
import { basename, dirname as dirname4, join as join10, resolve as resolve4 } from "path";
import { fileURLToPath } from "url";
function packageRoot(env = process.env) {
  if (env.AGENTIC_SDLC_PACKAGE) return resolve4(env.AGENTIC_SDLC_PACKAGE);
  let d = dirname4(fileURLToPath(import.meta.url));
  while (!existsSync8(join10(d, "package.json"))) {
    const up = dirname4(d);
    if (up === d) throw new Error("cannot find the agentic-sdlc package root");
    d = up;
  }
  return d;
}
function missingBindingKeys(template, binding) {
  const t = (0, import_yaml5.parse)(template), b = (0, import_yaml5.parse)(binding);
  const isMap = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  if (!isMap(t) || !isMap(b)) return [];
  const out = [];
  for (const [k, v] of Object.entries(t)) {
    if (!(k in b)) out.push(k);
    else if (isMap(v) && isMap(b[k])) {
      for (const k2 of Object.keys(v)) if (!(k2 in b[k])) out.push(`${k}.${k2}`);
    }
  }
  return out;
}
function registerMcp(pkg, root, harness, force, log) {
  const snippet = readFileSync9(need2(pkg, `templates/mcp/${harness === "codex" ? "codex.toml" : harness + ".json"}`), "utf8");
  const rel = MCP_FILES.get(harness);
  if (!rel) {
    log.push(`add this MCP server to your harness config:
${snippet.trim()}`);
    return;
  }
  const file = join10(root, rel);
  const cur = existsSync8(file) ? readFileSync9(file, "utf8") : "";
  let next;
  if (harness === "codex") {
    if (/^\[mcp_servers\.("?)agentic-sdlc\1\]/m.test(cur)) {
      log.push(`kept ${rel}`);
      return;
    }
    next = (cur ? cur.replace(/\n*$/, "\n\n") : "") + snippet;
  } else {
    const want = JSON.parse(snippet);
    const doc = cur.trim() ? parseJson(cur, rel) : {};
    const had = doc.mcpServers?.["agentic-sdlc"];
    const old = had?.command === "npx" && Array.isArray(had.args) && had.args.includes("agentic-sdlc");
    if (had && !force && !old) {
      log.push(`kept ${rel}`);
      return;
    }
    doc.mcpServers = { ...doc.mcpServers, ...want.mcpServers };
    next = JSON.stringify(doc, null, 2) + "\n";
  }
  mkdirSync4(dirname4(file), { recursive: true });
  writeFileSync5(file, next);
  log.push(`wrote ${rel}`);
}
function pinCli(inst, version3, ref, force) {
  const file = join10(inst.root, CLI_PIN);
  inst.offered.add(CLI_PIN);
  let pkgName = CLI_PACKAGE, want = ref ?? `v${version3}`;
  if (existsSync8(file)) {
    const raw = readFileSync9(file);
    const cur = parseJson(raw.toString("utf8"), CLI_PIN);
    if (typeof cur.package === "string" && cur.package) pkgName = cur.package;
    if (!ref && !force && isSha(cur.ref) && sha(raw) !== inst.lock[CLI_PIN]) {
      inst.counts.kept++;
      inst.log.push(`kept ${CLI_PIN} (its ref is a commit sha you set; --ref <sha|vX.Y.Z> or --force moves it)`);
      return;
    }
  }
  const data = JSON.stringify({ package: pkgName, ref: want }, null, 2) + "\n";
  const had = existsSync8(file);
  if (had && sha(readFileSync9(file)) === sha(data)) {
    inst.lock[CLI_PIN] = sha(data);
    return;
  }
  mkdirSync4(dirname4(file), { recursive: true });
  writeFileSync5(file, data);
  inst.lock[CLI_PIN] = sha(data);
  if (had) inst.counts.updated++;
  else inst.counts.wrote++;
  inst.log.push(`${had ? "updated" : "wrote"} ${CLI_PIN} (ref ${want})`);
}
function ignoreCliCache(root, log) {
  const file = join10(root, ".gitignore");
  let text = existsSync8(file) ? readFileSync9(file, "utf8") : "";
  const add = IGNORED.filter((e) => !new RegExp(`^/?${e.slice(0, -1).replace(/\./g, "\\.")}/?\\s*$`, "m").test(text));
  if (!add.length) return;
  text += (text && !text.endsWith("\n") ? "\n" : "") + add.map((e) => e + "\n").join("");
  writeFileSync5(file, text);
  log.push(`added ${add.join(", ")} to .gitignore`);
}
function oldPinHint(root, log) {
  try {
    const doc = JSON.parse(readFileSync9(join10(root, "package.json"), "utf8"));
    if (doc?.devDependencies?.["agentic-sdlc"] !== void 0)
      log.push(`package.json pins agentic-sdlc as a devDependency: remove it with npm rm agentic-sdlc (the pin is ${CLI_PIN})`);
  } catch {
  }
}
function claudeSetup(root, inst, log, noPlugin) {
  let models = {};
  try {
    models = (0, import_yaml5.parse)(readFileSync9(join10(root, BINDING_PATH), "utf8"))?.models ?? {};
  } catch {
  }
  for (const tier of TIERS4) {
    const rel = `.claude/agents/sdlc-${tier}.md`;
    const model = !models[tier] || /^your-/.test(models[tier]) ? "inherit" : models[tier];
    inst.put(rel, `---
name: sdlc-${tier}
description: Runs one agentic-sdlc step whose tier is ${tier}. The sdlc skill hands a step to this agent when the step is at the ${tier} tier.
model: ${model}
---

You run one step of the agentic-sdlc process at the ${tier} tier. Your task names the step file to follow
(\`.agents/skills/sdlc-<skill>/steps/<step>.md\`, or the skill's \`SKILL.md\` for a one-step skill). Read it, follow it to
its last Done when, and report the result and the evidence. Call the CLI as \`agentic-sdlc <group> <verb>\` (it is \`${LAUNCHER}\`).
Do not start subagents.
`, void 0, false, (t) => t.includes("npx --no agentic-sdlc"));
  }
  const file = join10(root, "CLAUDE.md");
  const cur = existsSync8(file) ? readFileSync9(file, "utf8") : "";
  if (/^@AGENTS\.md\s*$/m.test(cur)) log.push("kept CLAUDE.md (imports @AGENTS.md)");
  else {
    writeFileSync5(file, (cur ? cur.replace(/\n*$/, "\n\n") : "") + "@AGENTS.md\n");
    log.push(cur ? "appended @AGENTS.md to CLAUDE.md" : "wrote CLAUDE.md (@AGENTS.md)");
  }
  if (noPlugin) return;
  log.push("install the Claude Code plugin (skills, guard hook, MCP server): /plugin marketplace add dmitriywind/agentic-sdlc, then /plugin install agentic-sdlc@agentic-sdlc");
  log.push("headless runs load it from the pinned package: claude -p ... --plugin-dir .agents/.cli/<ref>/node_modules/agentic-sdlc (the ref in .agents/cli.json)");
}
function originRepo(root) {
  try {
    const url = execFileSync2("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url)?.[1];
  } catch {
    return void 0;
  }
}
async function init(root, argv, log) {
  const f = flagsOf(argv);
  const board = f.board ?? "github", forge = f.forge ?? "github", vcs = f.vcs ?? "git";
  const prior = f.upgrade === "true" && f.harness === void 0 && (existsSync8(join10(root, ".claude/skills")) || existsSync8(join10(root, ".claude/agents")) && readdirSync6(join10(root, ".claude/agents")).some((n) => /^sdlc-.*\.md$/.test(n)));
  const harness = f.harness ?? (prior ? "claude" : "generic");
  const force = f.force === "true";
  const profile = f.profile ?? "individual";
  if (!ADAPTERS.board.includes(board)) throw new Error(`--board must be one of ${ADAPTERS.board.join("|")}, got '${board}'`);
  if (!["individual", "individual-api", "organization"].includes(profile)) throw new Error(`--profile must be individual, individual-api or organization, got '${profile}'`);
  const org = profile === "organization";
  if (vcs !== "git") throw new Error(`--vcs must be git (v2 supports git only), got '${vcs}'`);
  if (!FORGES.includes(forge)) throw new Error(`--forge must be one of ${FORGES.join("|")}, got '${forge}'`);
  if (!MCP_FILES.has(harness)) throw new Error(`--harness must be one of ${[...MCP_FILES.keys()].join("|")}, got '${harness}'`);
  const pkg = packageRoot();
  const pkgJson = join10(pkg, "package.json");
  const version3 = existsSync8(pkgJson) ? readJson2(pkgJson).version : "next";
  if (f.ref !== void 0 && !isSha(f.ref) && !isTag(f.ref)) throw new Error(`--ref must be a 40-hex commit sha or a version tag like v${version3}, got '${f.ref}'`);
  const skills = need2(pkg, "skills");
  const inst = new Installer(root, pkg, force, log);
  inst.skills("skills", ".agents/skills", true);
  const noPlugin = harness === "claude" && (f["no-plugin"] === "true" || f.upgrade === "true" && existsSync8(join10(root, ".claude/skills")));
  if (noPlugin) inst.skills("skills", ".claude/skills", true);
  else for (const n of filesUnder(skills)) inst.skip(join10(".claude/skills", inst.installedName(n)));
  pinCli(inst, version3, f.ref, force);
  if (inst.copy("templates/bin/agentic-sdlc", LAUNCHER)) chmodSync2(join10(root, LAUNCHER), 493);
  ignoreCliCache(root, log);
  oldPinHint(root, log);
  if (harness !== "claude" || noPlugin) registerMcp(pkg, root, harness, force, log);
  else log.push("MCP server: provided by the agentic-sdlc Claude Code plugin (use --no-plugin to write .mcp.json instead)");
  const scorers = join10(pkg, "scorers");
  if (existsSync8(scorers)) {
    for (const n of filesUnder(scorers)) inst.copy(join10("scorers", n), join10(".agents", "scorers", n));
  }
  const bindingFile = join10(root, BINDING_PATH);
  const hadBinding = existsSync8(bindingFile);
  if (hadBinding) log.push(`kept ${BINDING_PATH}`);
  else {
    const doc = (0, import_yaml5.parseDocument)(readFileSync9(need2(pkg, "templates/binding.yml"), "utf8"));
    doc.setIn(["board", "adapter"], board);
    doc.setIn(["forge", "adapter"], forge);
    doc.setIn(["vcs", "adapter"], vcs);
    doc.set("profile", profile);
    doc.setIn(["executors", "default"], { kind: "harness", sandbox: org ? "container" : "cloud" });
    if (org) {
      doc.set("traces", { uri: ".agents/runtime/traces/{run_id}.jsonl" });
      doc.setIn(["forge", "options", "token_env"], "AGENTIC_FORGE_TOKEN");
      doc.setIn(["forge", "options", "review_token_env"], "AGENTIC_REVIEW_TOKEN");
      doc.setIn(["forge", "review_identity"], "your-review-app[bot]");
    }
    const repo = forge === "github" ? originRepo(root) : void 0;
    if (repo) {
      doc.setIn(["forge", "options", "repo"], repo);
      if (board === "github-issues") doc.setIn(["board", "options", "repo"], repo);
      log.push(`set the repo ${repo} from git remote origin`);
    }
    if (board === "local") {
      const hb = await createLocalBoard({ root }).create({ title: "Heartbeat", body: "agentic-sdlc heartbeat comments. Not a ticket.", status: "Cancelled" });
      doc.setIn(["heartbeat", "ticket"], hb.id);
      log.push(`created heartbeat ticket ${hb.id} on the local board`);
    } else log.push("create the heartbeat ticket on the board and put its id in heartbeat.ticket");
    mkdirSync4(dirname4(bindingFile), { recursive: true });
    writeFileSync5(bindingFile, String(doc));
    log.push(`wrote ${BINDING_PATH}`);
  }
  const gates = join10(pkg, "templates", "gates");
  const dir = need2(pkg, `templates/gates/${forge}`);
  const bound = (0, import_yaml5.parse)(readFileSync9(bindingFile, "utf8"));
  const continuous = bound?.product?.delivery === "continuous";
  const oneIdentity = !bound?.forge?.review_identity;
  inst.bound = {
    trunk: bound?.vcs?.trunk || DEFAULTS.trunk,
    releasePrefix: bound?.vcs?.release_prefix || DEFAULTS.releasePrefix,
    delivery: bound?.product?.delivery || DEFAULTS.delivery,
    install: bound?.commands?.install || DEFAULTS.install,
    verify: bound?.commands?.verify || DEFAULTS.verify
  };
  {
    const tdir = `templates/gates/${forge}`;
    for (const n of readdirSync6(dir).filter((n2) => n2.endsWith(".yml"))) {
      if (continuous && n === "agentic-sdlc-release.yml") inst.skip(join10(".github", "workflows", n));
      else inst.copy(`${tdir}/${n}`, join10(".github", "workflows", n));
    }
    if (existsSync8(join10(dir, "pull_request_template.md"))) inst.copy(`${tdir}/pull_request_template.md`, ".github/pull_request_template.md");
    if (existsSync8(join10(dir, "ruleset.trunk.json"))) {
      let text = readFileSync9(join10(dir, "ruleset.trunk.json"), "utf8");
      if (oneIdentity) {
        parseJson(text, "ruleset.trunk.json");
        text = oneIdentityRuleset(text);
      }
      inst.put(".github/rulesets/trunk.json", text, `${tdir}/ruleset.trunk.json`);
      log.push("import .github/rulesets/trunk.json in the repo settings (Rules > Rulesets) to protect the trunk");
      log.push(oneIdentity ? "one identity: the ruleset needs no approving review and pins every required check to GitHub Actions (integration_id 15368); a Full-lane CR waits on human-approval until a collaborator approves it or you merge it as admin" : "its CI checks are pinned to GitHub Actions (integration_id 15368); review and human-approval are posted with the review token: pin them to your review GitHub App's id if it is an App (a PAT cannot be pinned)");
    }
    if (continuous && existsSync8(join10(dir, "ruleset.release.json"))) inst.skip(".github/rulesets/release.json");
    if (!continuous && existsSync8(join10(dir, "ruleset.release.json"))) {
      inst.copy(`${tdir}/ruleset.release.json`, ".github/rulesets/release.json");
      log.push("import .github/rulesets/release.json (Rules > Rulesets) and add the release bot (app or role) as a bypass actor; set its include to your vcs.release_prefix");
    }
  }
  if (existsSync8(join10(gates, "hooks", "pre-push"))) {
    if (inst.copy("templates/gates/hooks/pre-push", ".agents/hooks/pre-push")) chmodSync2(join10(root, ".agents", "hooks", "pre-push"), 493);
    log.push("enable the hook with: git config core.hooksPath .agents/hooks");
  }
  const setup = join10(pkg, "templates", "runner", "setup.sh");
  if (existsSync8(setup)) inst.copy("templates/runner/setup.sh", ".agents/runner-setup.sh");
  for (const n of ["cycle-prompt.md", "review-prompt.md"]) {
    const prompt2 = join10(pkg, "templates", "runner", n);
    if (existsSync8(prompt2)) inst.copy(`templates/runner/${n}`, join10(".agents", n));
  }
  const agents = join10(root, "AGENTS.md");
  const cur = existsSync8(agents) ? readFileSync9(agents, "utf8") : "";
  const s = cur.indexOf(START), e = cur.indexOf(END);
  const next = s >= 0 && e > s ? cur.slice(0, s) + POINTER + cur.slice(e + END.length) : (cur ? cur.replace(/\n*$/, "\n\n") : "") + POINTER + "\n";
  if (next !== cur) writeFileSync5(agents, next);
  const agentsChanged = next !== cur;
  if (agentsChanged) log.push("updated AGENTS.md");
  if (harness === "claude") claudeSetup(root, inst, log, noPlugin);
  else for (const tier of TIERS4) inst.skip(`.claude/agents/sdlc-${tier}.md`);
  inst.finish();
  const missing = missingKeysLine(missingBindingKeys(readFileSync9(need2(pkg, "templates/binding.yml"), "utf8"), readFileSync9(bindingFile, "utf8")));
  if (missing) log.push(missing);
  const c = inst.counts;
  log.push(`install: ${c.wrote} new, ${c.updated} updated, ${c.kept} kept (differ from every released version), ${c.stale} stale${c.removed ? `, ${c.removed} removed` : ""}`);
  const changed = c.wrote + c.updated + c.removed > 0 || agentsChanged;
  if (hadBinding && !changed) log.push(c.kept ? `install: nothing to update; ${c.kept} kept (differ from every released version)` : "install: up to date");
  else if (hadBinding) log.push("upgrade: review the kept files, then run .agents/bin/agentic-sdlc validate and .agents/bin/agentic-sdlc doctor (the first call installs the pinned CLI)");
}
function validate(root, warnings = []) {
  const problems = [];
  let binding;
  try {
    binding = loadBinding(root);
    problems.push(...validateBinding(binding));
  } catch (e) {
    problems.push(e.message);
  }
  const dir = join10(root, ".agents", "skills");
  if (!existsSync8(dir)) return [...problems, ".agents/skills is missing"];
  const pack = readSkills(dir);
  problems.push(...pack.errors.map((m) => `skill ${m}`));
  warnings.push(...pack.warnings.map((m) => `skill ${m}`));
  const targets = scorerTargets(pack);
  for (const k of Object.keys(binding?.executors ?? {})) {
    if (k === "default" || targets.has(k)) continue;
    if (Object.hasOwn(OLD_STEP_IDS, k)) warnings.push(`executors.${k}: '${k}' is an old skill name; it runs as ${stepIdOf(k)}, so name it that`);
    else warnings.push(`executors.${k} names no step or skill, so no dispatch uses it (bench --executor ${k} still does)`);
  }
  return problems;
}
function trunkProtection(b, ctx) {
  const repo = b.forge.options?.repo;
  const reminder = "warn: pin each required check to the CI integration that posts it, so no other token can post it";
  if (!repo) return ["trunk protection: check manually", reminder];
  const open = `warn: trunk protection: ${b.vcs.trunk} has no enforced ruleset or branch protection, so no gate blocks a merge (a private repo on GitHub Free cannot enforce one)`;
  let rules;
  try {
    rules = JSON.parse(ctx.exec("gh", ["api", `repos/${repo}/rules/branches/${b.vcs.trunk}`]));
  } catch (e) {
    if (/Upgrade to GitHub Pro/.test(e.message)) return [open];
    return ["trunk protection: check manually (cannot read the trunk rules)", reminder];
  }
  if (!rules.length) {
    let classic = false;
    try {
      classic = ctx.exec("gh", ["api", `repos/${repo}/branches/${b.vcs.trunk}`, "--jq", ".protected"]).trim() === "true";
    } catch {
    }
    return classic ? ["trunk protection: classic branch protection is on; check its required checks manually", reminder] : [open];
  }
  const checks = rules.filter((r) => r.type === "required_status_checks").flatMap((r) => r.parameters?.required_status_checks ?? []);
  if (!checks.length) return ["fail trunk protection: no required status checks"];
  const loose = checks.filter((c) => !c.integration_id).map((c) => c.context);
  return [
    "ok   trunk protection: required checks block merge",
    ...loose.length ? [`warn: required checks not pinned to an app (integration_id): ${loose.join(", ")}; any token with status access can post them`] : []
  ];
}
function implementerToken(b, ctx) {
  const name = b.forge.options?.token_env;
  const token = name ? ctx.env?.[name] : void 0;
  let head;
  try {
    head = ctx.exec("gh", ["api", "-i", "user"], token ? { env: { ...ctx.env, GH_TOKEN: token } } : {});
  } catch {
    return void 0;
  }
  const scopes = /^x-oauth-scopes:(.*)$/im.exec(head)?.[1].split(",").map((s) => s.trim()) ?? [];
  const wide = scopes.filter((s) => s === "repo" || s === "repo:status");
  return wide.length ? `warn: the implementer token (${name ?? "gh login"}) has scope ${wide.join(", ")}, so code a cycle runs can post commit statuses; use a fine-grained token with Commit statuses: no access, and pin every required check to its app` : void 0;
}
function selfHostedRunner(b, ctx) {
  const repo = b.forge.options?.repo;
  if (!repo) return void 0;
  let vars;
  let visibility;
  try {
    vars = Object.fromEntries(JSON.parse(ctx.exec("gh", ["variable", "list", "-R", repo, "--json", "name,value"])).map((v) => [v.name, v.value]));
    visibility = ctx.exec("gh", ["api", `repos/${repo}`, "--jq", ".visibility"]).trim();
  } catch {
    return void 0;
  }
  const code = vars.AGENTIC_RUNS_ON ?? "", trusted = vars.AGENTIC_RUNS_ON_TRUSTED ?? code;
  if (![code, trusted].some((v) => v.includes("self-hosted"))) return void 0;
  if (visibility === "public") return "fail runner: a self-hosted runner on a public repo runs fork code on your machine; use GitHub-hosted runners";
  if (code.includes("self-hosted") && trusted === code) return "warn: runner: CR code and the secret jobs share one self-hosted runner; set AGENTIC_RUNS_ON_TRUSTED to a separate runner (see docs/forges.md, Self-hosted runners)";
  return `ok   runner: self-hosted, code on ${code || "ubuntu-latest"}, secrets on ${trusted || "ubuntu-latest"}`;
}
function cloudBoard(b, env = {}) {
  if (b.board?.adapter !== "github" || env.CLAUDE_CODE_REMOTE !== "true") return void 0;
  return "fail board: a Claude cloud session cannot reach GitHub Projects (board adapter github); use github-issues, jira or linear, or run the cycle from GitHub Actions (templates/runner/github-actions-claude.yml)";
}
function deliveryWorkflow(b, root) {
  const f = join10(root, ".github", "workflows", "agentic-sdlc-delivery.yml");
  if (!existsSync8(f)) return void 0;
  const wf = (0, import_yaml5.parse)(readFileSync9(f, "utf8"));
  const br = wf?.on?.push?.branches ?? [];
  if (!br.includes(b.vcs.trunk))
    return `fail delivery workflow: push branches ${br.join(", ")} do not name trunk ${b.vcs.trunk}; edit its 'set:' lines`;
  const delivery = b.product?.delivery ?? "release-line";
  const want = [["TRUNK", "vcs.trunk", b.vcs.trunk], ["DELIVERY", "product.delivery", delivery]];
  if (delivery === "release-line") want.push(["RELEASE_PREFIX", "vcs.release_prefix", b.vcs.release_prefix]);
  for (const [k, key, v] of want)
    if (wf?.env?.[k] !== v) return `fail delivery workflow: env.${k} is '${wf?.env?.[k] ?? ""}', not ${key} '${v}'; edit its 'set:' lines`;
  return `ok   delivery workflow: names trunk ${b.vcs.trunk}`;
}
function unpinnedActions(root) {
  const dir = join10(root, ".github", "workflows");
  if (!existsSync8(dir)) return void 0;
  const bad = readdirSync6(dir).filter((n) => /^agentic-sdlc-.*\.ya?ml$/.test(n)).flatMap((n) => [...readFileSync9(join10(dir, n), "utf8").matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)/gm)].map((m) => m[1]).filter((u) => !u.startsWith("./") && !/@[0-9a-f]{40}$/.test(u)).map((u) => `${n}: ${u}`));
  return bad.length ? `warn workflow actions: not pinned to a commit SHA (${[...new Set(bad)].join(", ")}); a tag can move, so let Dependabot's github-actions ecosystem pin them` : void 0;
}
function cliPin(root) {
  const out = [];
  const file = join10(root, CLI_PIN);
  if (!existsSync8(file)) out.push(`fail cli pin: ${CLI_PIN} is missing; run agentic-sdlc init`);
  else {
    let pin;
    try {
      pin = JSON.parse(readFileSync9(file, "utf8"));
    } catch (e) {
      out.push(`fail cli pin: ${CLI_PIN} is not valid JSON (${e.message})`);
    }
    if (pin !== void 0 && (!pin || typeof pin !== "object" || Array.isArray(pin))) out.push(`fail cli pin: ${CLI_PIN} is not a JSON object`);
    else if (pin) {
      if (typeof pin.package !== "string" || !pin.package) out.push(`fail cli pin: ${CLI_PIN} has no package`);
      if (isSha(pin.ref)) out.push(`ok   cli pin: ${pin.package} at commit ${String(pin.ref).slice(0, 12)}`);
      else if (isTag(pin.ref)) out.push(`warn: cli pin: ref ${pin.ref} is a tag, and a tag can move; pin a commit sha (agentic-sdlc init --ref <sha>)`);
      else out.push(`fail cli pin: ref '${pin.ref ?? ""}' in ${CLI_PIN} is neither a 40-hex commit sha nor a version tag like v1.2.3`);
    }
  }
  const launcher = join10(root, LAUNCHER);
  if (!existsSync8(launcher)) out.push(`fail cli pin: ${LAUNCHER} is missing; run agentic-sdlc init`);
  else if (process.platform !== "win32" && !(statSync(launcher).mode & 73)) out.push(`fail cli pin: ${LAUNCHER} is not executable; chmod +x ${LAUNCHER}`);
  return out;
}
var import_yaml5, START, END, POINTER, INSTALL_LOCK, LEGACY_LOCK, TIERS4, FORGES, INIT_FLAGS, flagsOf, need2, parseJson, readJson2, filesUnder, posix2, Installer, missingKeysLine, MCP_FILES, CLI_PIN, CLI_PACKAGE, LAUNCHER, IGNORED, isSha, isTag, envNames, redact2, firstLines, probeFailure, cli8;
var init_install = __esm({
  "src/install.ts"() {
    "use strict";
    import_yaml5 = __toESM(require_dist(), 1);
    init_binding();
    init_board();
    init_forge();
    init_vcs();
    init_local();
    init_pristine();
    init_skills();
    START = "<!-- agentic-sdlc:start -->";
    END = "<!-- agentic-sdlc:end -->";
    POINTER = `${START}
Work lives on the board named in \`.agents/binding.yml\`. Before any work, invoke the sdlc skill (\`/agentic-sdlc:sdlc\` in Claude Code).
The CLI the skills call as \`agentic-sdlc <group> <verb>\` is \`.agents/bin/agentic-sdlc\` (pinned in \`.agents/cli.json\`).
Never duplicate the process here: the skills own it, the binding owns the project values.
${END}`;
    INSTALL_LOCK = ".agents/install.lock.json";
    LEGACY_LOCK = ".agents/skills.lock.json";
    TIERS4 = ["fast", "balanced", "deep"];
    FORGES = ["github"];
    INIT_FLAGS = ["board", "forge", "vcs", "harness", "profile", "ref", "force", "upgrade", "no-plugin"];
    flagsOf = (argv) => {
      const f = {};
      for (let i = 0; i < argv.length; i++) {
        if (!argv[i].startsWith("--")) throw new Error(`unexpected argument '${argv[i]}'`);
        const k = argv[i].slice(2);
        if (!INIT_FLAGS.includes(k)) throw new Error(`unknown flag --${k} (init takes ${INIT_FLAGS.map((n) => "--" + n).join(", ")})`);
        if (k === "force" || k === "upgrade" || k === "no-plugin") f[k] = "true";
        else if (i + 1 < argv.length) f[k] = argv[++i];
        else throw new Error(`--${k} needs a value`);
      }
      return f;
    };
    need2 = (pkg, rel) => {
      const p = join10(pkg, rel);
      if (!existsSync8(p)) throw new Error(`package is missing ${rel} (looked in ${pkg})`);
      return p;
    };
    parseJson = (text, p) => {
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(`${p} is not valid JSON (${e.message}); fix it and run init again`);
      }
    };
    readJson2 = (p) => parseJson(readFileSync9(p, "utf8"), basename(p));
    filesUnder = (dir) => readdirSync6(dir).flatMap((n) => statSync(join10(dir, n)).isDirectory() ? filesUnder(join10(dir, n)).map((f) => join10(n, f)) : [n]);
    posix2 = (p) => p.replaceAll("\\", "/");
    Installer = class {
      lock = {};
      offered = /* @__PURE__ */ new Set();
      counts = { wrote: 0, updated: 0, kept: 0, stale: 0, removed: 0 };
      root;
      pkg;
      force;
      log;
      known;
      /** The binding's values for the `# set:` lines of the stock workflows. */
      bound = DEFAULTS;
      constructor(root, pkg, force, log) {
        this.root = root;
        this.pkg = pkg;
        this.force = force;
        this.log = log;
        this.known = knownHashes(pkg);
        for (const f of [LEGACY_LOCK, INSTALL_LOCK]) {
          const file = join10(root, f);
          if (existsSync8(file)) Object.assign(this.lock, readJson2(file));
        }
      }
      /** Install `data` at `rel`. `src` is the package file it comes from (named when a differing file is kept). `quiet` hides wrote/updated lines. Returns false when a differing file is kept. */
      put(rel, data, src, quiet = false, legacy) {
        rel = posix2(rel);
        this.offered.add(rel);
        const to = join10(this.root, rel), want = sha(data);
        let how = "wrote";
        if (existsSync8(to)) {
          const bytes = readFileSync9(to), have = sha(bytes);
          if (have === want) {
            this.lock[rel] = want;
            return true;
          }
          if (have === this.lock[rel] || this.known.has(releasedHash(basename(rel), bytes, rel)) || !(rel in this.lock) && legacy?.(bytes.toString("utf8"))) how = "updated";
          else if (this.force) how = "overwrote";
          else {
            this.counts.kept++;
            this.log.push(`kept ${rel} (differs from every released version; ${src ? `--force overwrites, see ${join10(this.pkg, src)}` : "--force regenerates it"})`);
            return false;
          }
        }
        mkdirSync4(dirname4(to), { recursive: true });
        writeFileSync5(to, data);
        this.lock[rel] = want;
        if (how === "wrote") this.counts.wrote++;
        else this.counts.updated++;
        if (!quiet) this.log.push(`${how} ${rel}`);
        return true;
      }
      /** Install the package file `src` (relative to the package) at `rel`. */
      copy(src, rel, quiet = false) {
        const data = readFileSync9(join10(this.pkg, src));
        return this.put(rel, rel.startsWith(".github/workflows/") ? bindWorkflow(basename(rel), data.toString("utf8"), this.bound) : data, src, quiet);
      }
      /** Name a file this run does not install (by choice of binding or harness) so it is not reported as stale. */
      skip(rel) {
        this.offered.add(posix2(rel));
      }
      /**
       * Copy the skill pack into `dest`. `copied` writes the copied-install names: every skill folder but `sdlc` becomes
       * `sdlc-<name>` (folder, frontmatter name, links between skills; see renameSkill). The lock holds what was written;
       * pristine detection reads an installed file back to the package's source form.
       */
      skills(src, dest, copied = false) {
        const before = this.counts.wrote + this.counts.updated;
        const names = skillNames(join10(this.pkg, src));
        for (const f of filesUnder(join10(this.pkg, src))) {
          const from = join10(src, f);
          if (!copied) {
            this.copy(from, join10(dest, f), true);
            continue;
          }
          const seg = posix2(f).split("/");
          const folder = names.has(seg[0]) && seg[0] !== "sdlc" ? COPY_PREFIX + seg[0] : seg[0];
          const rel = join10(dest, folder, ...seg.slice(1));
          const data = readFileSync9(join10(this.pkg, from));
          this.put(rel, f.endsWith(".md") ? renameSkill(posix2(f), data.toString("utf8"), "to", names) : data, from, true);
        }
        const n = this.counts.wrote + this.counts.updated - before;
        this.log.push(`wrote ${dest} (${n} file${n === 1 ? "" : "s"} updated)`);
      }
      /** A package skill file's path inside a copied install's skills folder. */
      installedName(f) {
        const seg = posix2(f).split("/");
        return join10(seg[0] !== "sdlc" ? COPY_PREFIX + seg[0] : seg[0], ...seg.slice(1));
      }
      /** Is the installed file `rel` an unedited copy of some released version (its lock hash, or a known hash)? */
      pristine(rel) {
        const bytes = readFileSync9(join10(this.root, rel));
        return sha(bytes) === this.lock[rel] || this.known.has(releasedHash(basename(rel), bytes, rel));
      }
      /**
       * Files the package no longer ships: an unedited one (its lock hash, or a hash a released version had) is removed, so an
       * old skill folder does not linger and trigger; an edited one is reported stale and kept. Untracked files in the skill
       * folders are looked at too (an install from before the lock); one that is not an unedited copy is the project's own.
       * Then save the lock.
       */
      finish() {
        const skillFiles = [".agents/skills", ".claude/skills"].flatMap((d) => existsSync8(join10(this.root, d)) ? filesUnder(join10(this.root, d)).map((f) => posix2(join10(d, f))) : []);
        for (const rel of [.../* @__PURE__ */ new Set([...Object.keys(this.lock), ...skillFiles])].sort()) {
          if (this.offered.has(rel)) continue;
          if (!existsSync8(join10(this.root, rel))) {
            delete this.lock[rel];
            continue;
          }
          if (this.pristine(rel)) {
            rmSync3(join10(this.root, rel));
            delete this.lock[rel];
            for (let d = dirname4(join10(this.root, rel)); /[\\/]\.(?:agents|claude)[\\/]skills[\\/]./.test(d.slice(this.root.length)); d = dirname4(d)) {
              if (readdirSync6(d).length) break;
              rmdirSync(d);
            }
            this.counts.removed++;
            this.log.push(`removed ${rel}: no longer part of the package`);
          } else if (rel in this.lock) {
            this.counts.stale++;
            this.log.push(`stale ${rel}: no longer part of the package`);
          }
        }
        const file = join10(this.root, INSTALL_LOCK);
        mkdirSync4(dirname4(file), { recursive: true });
        writeFileSync5(file, JSON.stringify(Object.fromEntries(Object.entries(this.lock).sort(([a], [b]) => a < b ? -1 : 1)), null, 2) + "\n");
        const legacy = join10(this.root, LEGACY_LOCK);
        if (existsSync8(legacy)) {
          rmSync3(legacy);
          this.log.push(`removed ${LEGACY_LOCK}: merged into ${INSTALL_LOCK}`);
        }
      }
    };
    missingKeysLine = (keys) => keys.length ? `info: binding keys in the template that this binding does not set: ${keys.join(", ")}` : void 0;
    MCP_FILES = /* @__PURE__ */ new Map([
      ["claude", ".mcp.json"],
      ["cursor", ".cursor/mcp.json"],
      ["codex", ".codex/config.toml"],
      ["generic", null]
    ]);
    CLI_PIN = ".agents/cli.json";
    CLI_PACKAGE = "github:dmitriywind/agentic-sdlc";
    LAUNCHER = ".agents/bin/agentic-sdlc";
    IGNORED = [".agents/.cli/", ".agents/work/"];
    isSha = (s) => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);
    isTag = (s) => typeof s === "string" && /^v\d+\.\d+\.\d+(?:[-+.][0-9A-Za-z.+-]+)?$/.test(s);
    envNames = (x, out = []) => {
      if (x && typeof x === "object")
        for (const [k, v] of Object.entries(x)) {
          if (/_env$/.test(k) && typeof v === "string") out.push(v);
          else envNames(v, out);
        }
      return out;
    };
    redact2 = (msg, env, named = []) => {
      for (const [k, v] of Object.entries(env)) if (v && v.length >= 8 && (named.includes(k) || /TOKEN|KEY|SECRET|PASS|AUTH|PAT$/i.test(k))) msg = msg.replaceAll(v, "***");
      return msg;
    };
    firstLines = (msg) => {
      const [head, ...more] = msg.split("\n").map((l) => l.trim()).filter(Boolean);
      return more.length && /^Command failed/.test(head) ? `${head} (${more[0]})` : head ?? "";
    };
    probeFailure = (msg, env, binding) => firstLines(redact2(msg, env, envNames(binding)));
    cli8 = async (argv, ctx) => {
      const [verb, ...rest] = argv;
      const out = (s) => console.log(s);
      try {
        if (verb === "init") {
          const log = [];
          await init(ctx.root, rest, log);
          log.forEach(out);
          return 0;
        }
        if (verb === "validate" || verb === "doctor") {
          const warnings = [];
          const problems = validate(ctx.root, warnings);
          problems.forEach((p) => console.error(`problem: ${p}`));
          try {
            warnings.push(...bindingWarnings(loadBinding(ctx.root)));
          } catch {
          }
          warnings.forEach((m) => console.error(`warn: ${m}`));
          try {
            const info = missingKeysLine(missingBindingKeys(readFileSync9(join10(packageRoot(), "templates/binding.yml"), "utf8"), readFileSync9(join10(ctx.root, BINDING_PATH), "utf8")));
            if (info) out(info);
          } catch {
          }
          if (problems.length) return 1;
          out("validate: ok");
          if (verb === "validate") return 0;
          const binding = loadBinding(ctx.root);
          const c = { ...ctx, binding };
          const probes = [
            ["board.list", () => createBoard({ ...c, options: binding.board.options }).list()],
            ["forge.list", () => createForge({ ...c, options: binding.forge.options }).list({ checks: true, limit: 1 })],
            ["vcs.head", () => createVcs({ ...c, options: binding.vcs.options ?? {} }).head()]
          ];
          let bad = 0;
          const cb = cloudBoard(binding, ctx.env);
          if (cb) {
            out(cb);
            bad++;
            probes.shift();
          }
          trunkProtection(binding, ctx).forEach(out);
          const it = implementerToken(binding, ctx);
          if (it) out(it);
          const rn = selfHostedRunner(binding, ctx);
          if (rn) {
            out(rn);
            if (rn.startsWith("fail")) bad++;
          }
          const dw = deliveryWorkflow(binding, ctx.root);
          if (dw) {
            out(dw);
            if (dw.startsWith("fail")) bad++;
          }
          const ua = unpinnedActions(ctx.root);
          if (ua) out(ua);
          for (const l of cliPin(ctx.root)) {
            out(l);
            if (l.startsWith("fail")) bad++;
          }
          for (const [name, run] of probes) {
            try {
              await run();
              out(`ok   ${name}`);
            } catch (e) {
              bad++;
              out(`fail ${name}: ${probeFailure(e.message, ctx.env, binding)}`);
            }
          }
          return bad ? 1 : 0;
        }
        console.error("usage: agentic-sdlc init [--board ...] [--forge github] [--vcs git] [--harness ...] [--profile individual|individual-api|organization] [--no-plugin] [--upgrade] [--force] | validate | doctor");
        return 2;
      } catch (e) {
        console.error(redact2(e.message, ctx.env));
        return 1;
      }
    };
  }
});

// src/mcp.ts
var mcp_exports = {};
__export(mcp_exports, {
  GUARDED: () => GUARDED,
  MODERN_VERSIONS: () => MODERN_VERSIONS,
  PROTOCOL_VERSIONS: () => PROTOCOL_VERSIONS,
  allowList: () => allowList,
  cli: () => cli9,
  handle: () => handle
});
import { mkdtempSync as mkdtempSync4, readFileSync as readFileSync10, rmSync as rmSync4, writeFileSync as writeFileSync6 } from "fs";
import { tmpdir as tmpdir4 } from "os";
import { join as join11 } from "path";
import { createInterface } from "readline";
function allowList(arg) {
  const out = /* @__PURE__ */ new Set();
  for (const w of (arg ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    if (!GUARDED[w]) throw new Error(`--allow takes ${Object.keys(GUARDED).join(",")}; not ${w}`);
    out.add(GUARDED[w]);
  }
  return out;
}
function badArgument(s, args) {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return "arguments must be an object";
  const a = args;
  const sch = schema(s);
  for (const k of sch.required) if (a[k] === void 0 || a[k] === null) return `missing required argument '${k}'`;
  for (const [k, v] of Object.entries(a)) {
    const p = sch.properties[k];
    if (!p) return `unknown argument '${k}'`;
    if (v === null) continue;
    const okType = p.type === "string" ? typeof v === "string" : p.type === "boolean" ? typeof v === "boolean" : p.type === "integer" ? Number.isInteger(v) : p.type === "number" ? typeof v === "number" && Number.isFinite(v) : Array.isArray(v) && v.every((x) => typeof x === "string");
    if (!okType) return `argument '${k}' must be ${p.type === "array" ? "an array of strings" : `a ${p.type}`}`;
  }
  return void 0;
}
function capture(fn) {
  const run = async () => {
    const o = process.stdout.write, e = process.stderr.write;
    let out = "", err = "";
    process.stdout.write = ((c) => (out += c, true));
    process.stderr.write = ((c) => (err += c, true));
    try {
      return { code: await fn(), out, err };
    } catch (x) {
      return { code: 1, out, err: err + x.message };
    } finally {
      process.stdout.write = o;
      process.stderr.write = e;
    }
  };
  const p = queue2.then(run, run);
  queue2 = p;
  return p;
}
async function callTool(name, args, ctx, allow) {
  const s = served(allow).includes(name) ? TOOLS[name] : void 0;
  const fail = (text) => ({ content: [{ type: "text", text }], isError: true });
  if (!s) return fail(`unknown tool '${name}'`);
  if (name === "dispatch" && args.ticket === void 0 && args.cr === void 0 && args.skill !== "learn/improve") return fail("dispatch: ticket or cr required");
  const missing = [...s.pos, ...s.req, ...s.body ? ["body"] : []].filter((k) => args[k] === void 0);
  if (missing.length) return fail(`${name}: ${missing.join(", ")} required`);
  if (name === "forge_view" && args.n === void 0 && args.sha === void 0) return fail("forge_view: n or sha required");
  const argv = s.verb ? [s.verb] : [];
  argv.push(...s.pos.map((p) => String(args[p])));
  if (name === "forge_view" && args.n !== void 0) argv.push(String(args.n));
  for (const [k, t] of Object.entries(s.flags)) {
    const v = args[k];
    if (v === void 0 || v === null || v === false || k === "n") continue;
    if (t === "pos") {
      if (!args.clear && !args.none) argv.push(String(v));
    } else if (t === "boolean") argv.push(wire(k));
    else for (const x of t === "strings" ? v : [v]) argv.push(wire(k), String(x));
  }
  let dir;
  if (s.body) {
    dir = mkdtempSync4(join11(tmpdir4(), "agentic-sdlc-mcp-"));
    writeFileSync6(join11(dir, "body.md"), String(args.body));
    argv.push("--body-file", join11(dir, "body.md"));
  }
  try {
    const { cli: cli10 } = await MODULES[s.group]();
    const r = await capture(() => cli10(argv, ctx));
    if (r.code === 0) {
      let structured;
      try {
        structured = JSON.parse(r.out);
      } catch {
      }
      const obj = structured && typeof structured === "object" && !Array.isArray(structured);
      return { content: [{ type: "text", text: r.out }], ...obj ? { structuredContent: structured } : {} };
    }
    return fail((r.err || r.out).trim() || `exit ${r.code}`);
  } finally {
    if (dir) rmSync4(dir, { recursive: true, force: true });
  }
}
async function handle(msg, ctx, allow = /* @__PURE__ */ new Set()) {
  const id = msg?.id;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const err = (code, message, data) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...data ? { data } : {} } });
  if (!msg || typeof msg.method !== "string") return err(-32600, "invalid request");
  if (id === void 0) return null;
  const toolCall = async () => {
    const name = msg.params?.name;
    const s = typeof name === "string" && served(allow).includes(name) ? TOOLS[name] : void 0;
    if (!s) return { e: err(-32602, `unknown tool '${String(name)}'`) };
    const bad = badArgument(s, msg.params?.arguments ?? {});
    if (bad) return { e: err(-32602, `${name}: ${bad}`) };
    return { r: await callTool(name, msg.params?.arguments ?? {}, ctx, allow) };
  };
  if (msg.method !== "initialize" && (msg.method === "server/discover" || isModern(msg))) {
    const m = msg.params?._meta;
    const v = m?.[`${META}protocolVersion`];
    if (typeof v !== "string") return err(-32602, `_meta '${META}protocolVersion' is required`);
    const caps = m[`${META}clientCapabilities`];
    if (caps === null || typeof caps !== "object" || Array.isArray(caps)) return err(-32602, `_meta '${META}clientCapabilities' is required`);
    if (!MODERN_VERSIONS.includes(v)) return err(-32022, "Unsupported protocol version", { supported: [...MODERN_VERSIONS, ...PROTOCOL_VERSIONS], requested: v });
    const done = (result) => ok({ resultType: "complete", ...result, _meta: { [`${META}serverInfo`]: SERVER_INFO() } });
    switch (msg.method) {
      case "server/discover":
        return done({ supportedVersions: [...MODERN_VERSIONS, ...PROTOCOL_VERSIONS], capabilities: { tools: {} }, ttlMs: 0, cacheScope: "public" });
      case "tools/list":
        if (msg.params?.cursor !== void 0) return err(-32602, "Invalid cursor");
        return done({ tools: served(allow).map((name) => ({ name, description: TOOLS[name].doc, title: annotations(name).title, inputSchema: schema(TOOLS[name]), annotations: annotations(name) })), ttlMs: 0, cacheScope: "public" });
      case "tools/call": {
        const { e, r } = await toolCall();
        return e ?? done(r);
      }
      default:
        return err(-32601, `method not found: ${msg.method}`);
    }
  }
  switch (msg.method) {
    case "initialize":
      return ok({ protocolVersion: PROTOCOL_VERSIONS.includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : PROTOCOL_VERSIONS[0], serverInfo: SERVER_INFO(), capabilities: { tools: {} } });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: served(allow).map((name) => ({ name, description: TOOLS[name].doc, title: annotations(name).title, inputSchema: schema(TOOLS[name]), annotations: annotations(name) })) });
    case "tools/call": {
      const { e, r } = await toolCall();
      return e ?? ok(r);
    }
    default:
      return err(-32601, `method not found: ${msg.method}`);
  }
}
var MODULES, S, TOOLS, GUARDED, served, PROTOCOL_VERSIONS, MODERN_VERSIONS, META, SERVER_INFO, READ, DESTRUCTIVE, IDEMPOTENT, LOCAL, annotations, schema, wire, queue2, realWrite, version, isModern, cli9;
var init_mcp = __esm({
  "src/mcp.ts"() {
    "use strict";
    MODULES = {
      board: () => Promise.resolve().then(() => (init_board(), board_exports)),
      forge: () => Promise.resolve().then(() => (init_forge(), forge_exports)),
      vcs: () => Promise.resolve().then(() => (init_vcs(), vcs_exports)),
      dispatch: () => Promise.resolve().then(() => (init_dispatch(), dispatch_exports)),
      ledger: () => Promise.resolve().then(() => (init_ledger(), ledger_exports))
    };
    S = (group, verb, pos, flags, doc, req = [], body = false) => ({ group, verb, pos, flags, doc, body, req });
    TOOLS = {
      board_list: S("board", "list", [], { status: "strings", label: "string", search: "string" }, "List board items."),
      board_get: S("board", "get", ["id"], {}, "Get one board item."),
      board_create: S("board", "create", [], { title: "string", status: "string", label: "strings", parent: "string", milestone: "string" }, "Create a board item; body is the description.", ["title", "status"], true),
      board_move: S("board", "move", ["id", "status"], { only_from: "string" }, "Move an item to a status; refuses when only_from is set and the item is elsewhere."),
      board_set: S("board", "set", ["id", "field"], { value: "pos", clear: "boolean" }, "Set a logical field (size, priority, lane, shipped, release_version), or clear it."),
      board_label: S("board", "label", ["id", "op", "label"], {}, "Add or remove a label (op: add|remove)."),
      board_assign: S("board", "assign", ["id"], { user: "pos", none: "boolean" }, "Assign a user, or none."),
      board_milestone: S("board", "milestone", ["id"], { name: "pos", clear: "boolean" }, "Set the milestone of an item, or clear it."),
      board_comment: S("board", "comment", ["id"], { kind: "string", ref: "string" }, "Comment on an item; kind stamps the marker first line (ref is its value).", [], true),
      board_comments: S("board", "comments", ["id"], { last: "integer", marker: "string", kind: "string", ref: "string", author: "strings", trusted: "boolean" }, "Read comments, newest first; kind (with ref) filters by marker; trusted keeps the binding bots and owners."),
      board_hold: S("board", "hold", ["id"], { kind: "string" }, "Hold a ticket for a human: adds the human label and posts the ask (kind is the trigger); body is the ask.", ["kind"], true),
      board_holds: S("board", "holds", [], {}, "Held tickets: id, kind, askedAt, replied (an owner replied after the last ask), reply."),
      board_release: S("board", "release", ["id"], {}, "Release a held ticket: removes the human label."),
      board_close: S("board", "close", ["id"], { reason: "string" }, "Close an item (reason: completed|not_planned).", ["reason"]),
      board_child: S("board", "child", ["parent", "child"], {}, "Attach child to parent."),
      forge_open: S("forge", "open", [], { source: "string", title: "string", draft: "boolean" }, "Open a change request.", ["source", "title"], true),
      forge_view: S("forge", "view", [], { n: "string", sha: "string" }, "View a change request by number n, or by sha."),
      forge_diff: S("forge", "diff", ["n"], {}, "Diff of a change request."),
      forge_list: S("forge", "list", [], { state: "string", limit: "integer", since: "string", checks: "boolean" }, "List change requests (state: open|merged|all; limit: the newest n; since: an ISO date; checks: include check results, otherwise checks is empty)."),
      forge_ready: S("forge", "ready", ["n"], {}, "Mark ready for review."),
      forge_draft: S("forge", "draft", ["n"], {}, "Mark as draft."),
      forge_sync: S("forge", "sync", ["n"], {}, "Bring the change request up to date with its target."),
      forge_automerge: S("forge", "automerge", ["n"], {}, "Enable automerge."),
      forge_approve: S("forge", "approve", ["n"], {}, "Approve a change request."),
      forge_approvals: S("forge", "approvals", ["n"], {}, "Reviews of a change request: user, state, sha."),
      forge_comment: S("forge", "comment", ["n"], { kind: "string", ref: "string" }, "Comment on a change request; kind stamps the marker first line (ref is its value).", [], true),
      forge_comments: S("forge", "comments", ["n"], { last: "integer", marker: "string", kind: "string", ref: "string", author: "strings", trusted: "boolean" }, "Read change request comments, newest first; kind (with ref) filters by marker; trusted keeps the binding bots and owners."),
      forge_verdict: S("forge", "verdict", ["n"], { pass: "boolean", fail: "boolean" }, "Post the review report for the head (body) with its one Verdict line; with a review identity also the review status and, on pass, the approval. Exactly one of pass or fail.", [], true),
      forge_land: S("forge", "land", ["n"], { wait: "integer" }, "Wait (minutes, default cycle.land_wait_minutes or 5) for the required checks, then arm or perform the merge: merged, armed, waiting or blocked."),
      forge_queue: S("forge", "queue", [], {}, "Every open change request with its one next action: review, rework, land, sync, wait or escalate."),
      forge_cut: S("forge", "cut", ["revision", "version"], {}, "Ask the release workflow to cut a release line."),
      forge_status: S("forge", "status", ["n"], { context: "string", state: "string", description: "string", url: "string" }, "Post a commit status (n is the sha; state: pending|success|failure).", ["context", "state", "description"]),
      forge_runs: S("forge", "runs", [], { ref: "string", failed: "boolean" }, "List CI runs."),
      forge_run: S("forge", "run", ["id"], {}, "One CI run by id."),
      vcs_start: S("vcs", "start", ["name"], {}, "Start a working tree."),
      vcs_head: S("vcs", "head", [], {}, "Current ref and sha."),
      vcs_changed: S("vcs", "changed", [], { since: "string" }, "Changed paths."),
      vcs_base: S("vcs", "base", [], {}, "Base sha."),
      vcs_push: S("vcs", "push", [], {}, "Push the current work."),
      vcs_cut: S("vcs", "cut", ["rev", "release"], {}, "Cut a release ref."),
      vcs_tags: S("vcs", "tags", [], { prefix: "string" }, "List tags."),
      vcs_drop: S("vcs", "drop", ["name"], {}, "Remove a tree made by vcs_start."),
      dispatch: S("dispatch", "", ["skill"], { ticket: "string", cr: "string", run: "string", workdir: "string", run_model: "string", unattended: "boolean" }, "Start a step (skill or skill/step) on a ticket or, for a factory CR, on cr (neither for learn/improve). Prints the run's key and done line."),
      ledger_runs: S("ledger", "runs", [], { since: "integer", skill: "string" }, "Runs read from heartbeats."),
      ledger_summary: S("ledger", "summary", [], { since: "integer" }, "Aggregated run measures and the learning trigger."),
      ledger_plan: S("ledger", "plan", [], { run: "string" }, "Scorers, evidence and the hard-fact cap for one run.", ["run"]),
      ledger_record: S("ledger", "record", [], { run: "string", file: "string" }, "Record a judge run's scores file for one run.", ["run", "file"]),
      ledger_hash: S("ledger", "hash", ["skill_dir"], {}, "Hash of a skill folder, for the heartbeat skillHash."),
      ledger_stale: S("ledger", "stale", [], { max_hours: "integer" }, "Fails when the newest heartbeat is older than max_hours.", ["max_hours"])
    };
    GUARDED = { approve: "forge_approve", status: "forge_status" };
    served = (allow) => Object.keys(TOOLS).filter((n) => !Object.values(GUARDED).includes(n) || allow.has(n));
    PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
    MODERN_VERSIONS = ["2026-07-28"];
    META = "io.modelcontextprotocol/";
    SERVER_INFO = () => ({ name: "agentic-sdlc", version: version() });
    READ = /* @__PURE__ */ new Set([
      "board_list",
      "board_get",
      "board_comments",
      "board_holds",
      "forge_queue",
      "forge_view",
      "forge_diff",
      "forge_list",
      "forge_approvals",
      "forge_comments",
      "forge_runs",
      "forge_run",
      "vcs_head",
      "vcs_changed",
      "vcs_base",
      "vcs_tags",
      "ledger_runs",
      "ledger_summary",
      "ledger_plan",
      "ledger_hash",
      "ledger_stale"
    ]);
    DESTRUCTIVE = /* @__PURE__ */ new Set(["board_close", "vcs_drop"]);
    IDEMPOTENT = /* @__PURE__ */ new Set([
      "board_release",
      "forge_land",
      "board_move",
      "board_set",
      "board_label",
      "board_assign",
      "board_milestone",
      "board_close",
      "forge_ready",
      "forge_draft",
      "forge_sync",
      "forge_automerge",
      "forge_approve",
      "forge_status",
      "vcs_push",
      "vcs_drop",
      "ledger_record"
    ]);
    LOCAL = /* @__PURE__ */ new Set(["vcs_start", "vcs_head", "vcs_changed", "vcs_base", "vcs_tags", "vcs_drop", "ledger_hash"]);
    annotations = (name) => {
      const readOnlyHint = READ.has(name);
      return {
        title: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " "),
        readOnlyHint,
        ...readOnlyHint ? {} : { destructiveHint: DESTRUCTIVE.has(name), idempotentHint: IDEMPOTENT.has(name) },
        openWorldHint: !LOCAL.has(name)
      };
    };
    schema = (s) => {
      const properties = {};
      for (const p of s.pos) properties[p] = { type: "string" };
      for (const [k, t] of Object.entries(s.flags)) properties[k] = t === "strings" ? { type: "array", items: { type: "string" } } : { type: t === "pos" ? "string" : t };
      if (s.body) properties.body = { type: "string" };
      return { type: "object", properties, required: [...s.pos, ...s.req, ...s.body ? ["body"] : []], additionalProperties: false };
    };
    wire = (k) => "--" + k.replace(/_/g, "-");
    queue2 = Promise.resolve();
    realWrite = process.stdout.write.bind(process.stdout);
    version = () => JSON.parse(readFileSync10(new URL("../package.json", import.meta.url), "utf8")).version;
    isModern = (msg) => {
      const m = msg.params?._meta;
      return m !== null && typeof m === "object" && (`${META}protocolVersion` in m || `${META}clientCapabilities` in m);
    };
    cli9 = async (argv, ctx) => {
      if (argv.includes("--help") || argv.includes("-h")) {
        console.log(`usage: agentic-sdlc mcp [--allow approve,status]
  JSON-RPC over stdio, one message per line.
  --allow: also serve forge_approve and/or forge_status (review identity only).`);
        return 0;
      }
      const val = (flag) => {
        const i = argv.indexOf(flag);
        return i >= 0 ? argv[i + 1] : void 0;
      };
      let allow;
      try {
        allow = allowList(val("--allow"));
      } catch (e) {
        console.error(e.message);
        return 2;
      }
      for await (const line of createInterface({ input: process.stdin })) {
        if (!line.trim()) continue;
        let msg, r;
        try {
          msg = JSON.parse(line);
        } catch {
          realWrite(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }) + "\n");
          continue;
        }
        try {
          r = await handle(msg, ctx, allow);
        } catch (e) {
          r = { jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32603, message: e.message } };
        }
        if (r) realWrite(JSON.stringify(r) + "\n");
      }
      return 0;
    };
  }
});

// src/cli.ts
import { readFileSync as readFileSync11 } from "fs";
async function main(argv, env = process.env) {
  let root = process.cwd();
  const args = [...argv];
  while (args[0] === "--root" || args[0]?.startsWith("--root=")) {
    const [flag] = args.splice(0, 1);
    const v = flag === "--root" ? args.shift() : flag.slice(7);
    if (!v || v.startsWith("-") || Object.hasOwn(GROUPS, v)) {
      console.error(`--root needs a directory
${help()}`);
      return 2;
    }
    root = v;
  }
  const [group, ...rest] = args;
  if (group === "--version" || group === "-v") {
    console.log(version2());
    return 0;
  }
  if (group === "help" || group === "--help" || group === "-h") {
    console.log(help());
    return 0;
  }
  if (!group) {
    console.log(help());
    return 2;
  }
  if (!Object.hasOwn(GROUPS, group)) {
    console.error(`unknown group '${group}'
${help()}`);
    return 2;
  }
  const entry = GROUPS[group];
  const usage = `usage: agentic-sdlc ${group} ${group === "init" ? INIT_FLAGS2 : entry[1] ? "<verb> ..." : ""}
  ${entry[2]}`;
  const isHelp = (a) => a === "--help" || a === "-h";
  if (isHelp(rest[0]) || entry[1] && isHelp(rest[1])) {
    console.log(usage);
    return 0;
  }
  if (!rest.length && entry[1] && group !== "mcp") {
    console.error(usage);
    return 2;
  }
  const ctx = { root, env, exec, http };
  if (entry[1]) {
    let b;
    Object.defineProperty(ctx, "binding", { enumerable: true, get: () => b ??= loadBinding(root) });
  }
  try {
    const { cli: cli10 } = await entry[0]();
    return await cli10(entry[1] ? rest : [group, ...rest], ctx);
  } catch (e) {
    console.error(e.message);
    return 1;
  }
}
var GROUPS, INIT_FLAGS2, version2, help;
var init_cli = __esm({
  "src/cli.ts"() {
    "use strict";
    init_binding();
    init_exec();
    GROUPS = {
      init: [() => Promise.resolve().then(() => (init_install(), install_exports)), false, "copy skills, write the binding and CI gates"],
      validate: [() => Promise.resolve().then(() => (init_install(), install_exports)), false, "check the binding and skills"],
      doctor: [() => Promise.resolve().then(() => (init_install(), install_exports)), false, "validate, then probe board, forge and vcs"],
      board: [() => Promise.resolve().then(() => (init_board(), board_exports)), true, "list get create move set label assign milestone comment comments hold holds release close child"],
      forge: [() => Promise.resolve().then(() => (init_forge(), forge_exports)), true, "open view diff list ready draft sync automerge cut approve approvals comment comments verdict land queue status runs run"],
      vcs: [() => Promise.resolve().then(() => (init_vcs(), vcs_exports)), true, "start head changed base push cut tag tags drop checkout-tests"],
      dispatch: [() => Promise.resolve().then(() => (init_dispatch(), dispatch_exports)), true, "dispatch <skill>[/<step>] --ticket <id> | --cr <n> [--run <id>] [--run-model <m>] [--workdir <d>] [--unattended]: start the step on its executor"],
      gate: [() => Promise.resolve().then(() => (init_gates(), gates_exports)), true, "branch-names linkage approval proofs-on-base merged shipped evidence signal-on-red skill-regression review provenance"],
      ledger: [() => Promise.resolve().then(() => (init_ledger(), ledger_exports)), true, "runs summary plan record stale hash measures export: the run ledger from heartbeats; export sends runs as OTLP or CDEvents"],
      bench: [() => Promise.resolve().then(() => (init_bench(), bench_exports)), true, "build propose run report compare"],
      mcp: [() => Promise.resolve().then(() => (init_mcp(), mcp_exports)), true, "serve the port verbs as MCP tools over stdio; --allow approve,status"]
    };
    INIT_FLAGS2 = "[--profile individual|individual-api|organization] [--harness claude|codex|cursor|generic] [--board github|github-issues|jira|linear|local] [--forge github] [--vcs git] [--no-plugin] [--upgrade] [--force]";
    version2 = () => {
      try {
        return JSON.parse(readFileSync11(new URL("../package.json", import.meta.url), "utf8")).version;
      } catch {
        return "unknown";
      }
    };
    help = () => ["usage: agentic-sdlc [--root <dir>] [--version] <group> <verb> ...", ...Object.entries(GROUPS).map(([g, v]) => `  ${g.padEnd(9)} ${v[2]}`)].join("\n");
  }
});

// src/bin.ts
init_cli();
process.exitCode = await main(process.argv.slice(2));
