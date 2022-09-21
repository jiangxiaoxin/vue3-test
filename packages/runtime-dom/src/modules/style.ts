import { isString, hyphenate, capitalize, isArray } from '@vue/shared'
import { camelize } from '@vue/runtime-core'

type Style = string | Record<string, string | string[]> | null

export function patchStyle(el: Element, prev: Style, next: Style) {
  const style = (el as HTMLElement).style
  const isCssString = isString(next)
  if (next && !isCssString) {
    // next 是 style object
    // 编译时一般会把style编译成对象形式。所以遍历下新值和旧值的key，设置最新的样子。
    for (const key in next) {
      setStyle(style, key, next[key])
    }
    if (prev && !isString(prev)) {
      for (const key in prev) {
        if (next[key] == null) {
          // 如果 prev 也是 style object，清理一下现在没有的
          setStyle(style, key, '')
        }
      }
    }
  } else {

    /**
     * 走到这里，要么没有next，要么虽然有next，但是 css string
     * 如果是字符串，那就直接替换成next
     * 如果不是字符串，那就意味着没有next，（因为如果有next，要么是字符串，要么是obj），直接清除掉style
     */

    const currentDisplay = style.display
    if (isCssString) {
      if (prev !== next) {
        // 字符串新值，直接替换style对象的cssText
        style.cssText = next as string
      }
    } else if (prev) { // 没有next，又有prev，那要清理掉原来的style
      el.removeAttribute('style')
    }
    // indicates that the `display` of the element is controlled by `v-show`,
    // so we always keep the current `display` value regardless of the `style`
    // value, thus handing over control to `v-show`.

    // v-show 通过display来实现切换，不再看style里的设置
    if ('_vod' in el) {
      style.display = currentDisplay
    }
  }
}

const importantRE = /\s*!important$/

function setStyle(
  style: CSSStyleDeclaration,
  name: string,
  val: string | string[]
) {
  if (isArray(val)) {
    val.forEach(v => setStyle(style, name, v))
  } else {
    if (val == null) val = ''
    if (name.startsWith('--')) {
      // custom property definition
      style.setProperty(name, val)
    } else {
      const prefixed = autoPrefix(style, name)
      if (importantRE.test(val)) {
        // setProperty里不能直接设置 !important.要作为第3个参数单独设置
        // 设置的属性要用连字符格式：background-color
        // !important
        style.setProperty(
          hyphenate(prefixed),
          val.replace(importantRE, ''),
          'important'
        )
      } else {
        // 这里就没用setProperty
        style[prefixed as any] = val
      }
    }
  }
}

const prefixes = ['Webkit', 'Moz', 'ms']
const prefixCache: Record<string, string> = {}

/**
 * 自动添加不同浏览器中样式的前缀，并且带有缓存功能
 * 1. 先把rawName改成驼峰格式
 * 2. 如果这个驼峰格式的key在style里有，那就记录一下，然后返回即可
 * 3. 如果不在，那就将首字母再转成大写，for循环添加不同的前缀，看哪个key有，就记录住并返回
 * 4. 实在没有，那就直接返回好了。
 */

function autoPrefix(style: CSSStyleDeclaration, rawName: string): string {
  const cached = prefixCache[rawName]
  if (cached) {
    return cached
  }
  let name = camelize(rawName)
  if (name !== 'filter' && name in style) {
    return (prefixCache[rawName] = name)
  }
  name = capitalize(name)
  for (let i = 0; i < prefixes.length; i++) {
    const prefixed = prefixes[i] + name
    if (prefixed in style) {
      return (prefixCache[rawName] = prefixed)
    }
  }
  return rawName
}
