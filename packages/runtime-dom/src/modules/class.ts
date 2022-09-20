import { ElementWithTransition } from '../components/Transition'

// compiler should normalize class + :class bindings on the same element
// into a single binding ['staticClass', dynamic]
export function patchClass(el: Element, value: string | null, isSVG: boolean) {
  // directly setting className should be faster than setAttribute in theory
  // if this is an element during a transition, take the temporary transition
  // classes into account.
  const transitionClasses = (el as ElementWithTransition)._vtc
  if (transitionClasses) {
    value = (
      value ? [value, ...transitionClasses] : [...transitionClasses]
    ).join(' ')
  } // 最后还是个全的字符串
  // // 其实就是这样 if-else-（if-else）
    // value有值就是添加，没值就是删除
  if (value == null) {
    el.removeAttribute('class')
  } else {
    if (isSVG) {
      el.setAttribute('class', value)
    } else {
      el.className = value
    }
  }
}
