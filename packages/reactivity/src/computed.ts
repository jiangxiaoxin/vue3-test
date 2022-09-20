import { DebuggerOptions, ReactiveEffect } from './effect'
import { Ref, trackRefValue, triggerRefValue } from './ref'
import { isFunction, NOOP } from '@vue/shared'
import { ReactiveFlags, toRaw } from './reactive'
import { Dep } from './dep'

declare const ComputedRefSymbol: unique symbol

export interface ComputedRef<T = any> extends WritableComputedRef<T> {
  readonly value: T
  [ComputedRefSymbol]: true
}

export interface WritableComputedRef<T> extends Ref<T> {
  readonly effect: ReactiveEffect<T>
}

export type ComputedGetter<T> = (...args: any[]) => T
export type ComputedSetter<T> = (v: T) => void

export interface WritableComputedOptions<T> {
  get: ComputedGetter<T>
  set: ComputedSetter<T>
}

export class ComputedRefImpl<T> {
  public dep?: Dep = undefined

  private _value!: T
  public readonly effect: ReactiveEffect<T>

  public readonly __v_isRef = true
  public readonly [ReactiveFlags.IS_READONLY]: boolean = false

  public _dirty = true
  public _cacheable: boolean

  constructor(
    getter: ComputedGetter<T>,
    private readonly _setter: ComputedSetter<T>,
    isReadonly: boolean,
    isSSR: boolean
  ) {
    this.effect = new ReactiveEffect(getter, () => {
      // getter 访问的属性(count)会作为key来收集它所在的 this.effect
      // 当count发生值改变时,会trigger effect.scheduler ,也就执行到这

      // console.log(" 执行scheduler， dirty变true")
      if (!this._dirty) {
        this._dirty = true
        triggerRefValue(this)
      }
    })

    // console.log("computed getter", getter);
    

    this.effect.computed = this
    this.effect.active = this._cacheable = !isSSR
    this[ReactiveFlags.IS_READONLY] = isReadonly
  }

  get value() {
    debugger
    // the computed ref may get wrapped by other proxies e.g. readonly() #3376
    const self = toRaw(this)
    trackRefValue(self)
    if (self._dirty || !self._cacheable) {

      // computed 缓存之前的计算结果.
      // ReactiveEffect在trigger effect时,会判断前后两次的数据是否变化了 hasChanged(value, oldValue)
      // 所谓缓存,是因为新值跟旧值没变化, hasChanged没通过判断,就没走后面的trigger方法,自然也就不会重新执行

      // 既然没有重新执行,那effect的scheduler就没执行,_dirty就是false,通过是_cacheable又为true,那这里的effect就不会重新run,就相当于结果被缓存住了

      // 默认创建好后dirty就是true，标记成脏的，意思是希望计算一次值。这样计算完之后，dirty改为false，可以将值存下来了

      debugger
      self._dirty = false
      self._value = self.effect.run()!
    }
    return self._value
  }

  set value(newValue: T) {

    // set 使用简单,就是调了 一遍computed里传入的方法
    // 响应式是修改之后自动更新,重点是更新,跟修改没关系
    this._setter(newValue)
  }
}

export function computed<T>(
  getter: ComputedGetter<T>,
  debugOptions?: DebuggerOptions
): ComputedRef<T>
export function computed<T>(
  options: WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions
): WritableComputedRef<T>
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions,
  isSSR = false
) {
  let getter: ComputedGetter<T>
  let setter: ComputedSetter<T>

  debugger

  // 一般的用法,computed里面直接包的就是个箭头函数,这样onlyGetter = true
  const onlyGetter = isFunction(getterOrOptions)
  if (onlyGetter) {
    getter = getterOrOptions
    setter = __DEV__
      ? () => {
          console.warn('Write operation failed: computed value is readonly')
        }
      : NOOP
  } else {
    // 也可以传入一个对象,对象有get和set方法
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }

  const cRef = new ComputedRefImpl(getter, setter, onlyGetter || !setter, isSSR)

  if (__DEV__ && debugOptions && !isSSR) {
    cRef.effect.onTrack = debugOptions.onTrack
    cRef.effect.onTrigger = debugOptions.onTrigger
  }

  return cRef as any
}
