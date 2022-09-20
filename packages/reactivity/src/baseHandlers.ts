import {
  reactive,
  readonly,
  toRaw,
  ReactiveFlags,
  Target,
  readonlyMap,
  reactiveMap,
  shallowReactiveMap,
  shallowReadonlyMap,
  isReadonly,
  isShallow
} from './reactive'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import {
  track,
  trigger,
  ITERATE_KEY,
  pauseTracking,
  resetTracking
} from './effect'
import {
  isObject,
  hasOwn,
  isSymbol,
  hasChanged,
  isArray,
  isIntegerKey,
  extend,
  makeMap
} from '@vue/shared'
import { isRef } from './ref'
import { warn } from './warning'

const isNonTrackableKeys = /*#__PURE__*/ makeMap(`__proto__,__v_isRef,__isVue`)

const builtInSymbols = new Set(
  /*#__PURE__*/
  Object.getOwnPropertyNames(Symbol)
    // ios10.x Object.getOwnPropertyNames(Symbol) can enumerate 'arguments' and 'caller'
    // but accessing them on Symbol leads to TypeError because Symbol is a strict mode
    // function
    .filter(key => key !== 'arguments' && key !== 'caller')
    .map(key => (Symbol as any)[key])
    .filter(isSymbol)
)

const get = /*#__PURE__*/ createGetter()
const shallowGet = /*#__PURE__*/ createGetter(false, true)
const readonlyGet = /*#__PURE__*/ createGetter(true)
const shallowReadonlyGet = /*#__PURE__*/ createGetter(true, true)

const arrayInstrumentations = /*#__PURE__*/ createArrayInstrumentations()

function createArrayInstrumentations() {
  const instrumentations: Record<string, Function> = {}
  // instrument identity-sensitive Array methods to account for possible reactive
  // values
  ;(['includes', 'indexOf', 'lastIndexOf'] as const).forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      const arr = toRaw(this) as any // arr被reactive处理之后也是返回的proxy
      for (let i = 0, l = this.length; i < l; i++) {
        track(arr, TrackOpTypes.GET, i + '')
      }
      // we run the method using the original args first (which may be reactive)

      // arr.indexOf(obj)
      const res = arr[key](...args)
      if (res === -1 || res === false) {
        // if that didn't work, run it again using raw values.
        return arr[key](...args.map(toRaw))
      } else {
        return res
      }
    }
  })
  // instrument length-altering mutation methods to avoid length being tracked
  // which leads to infinite loops in some cases (#2137)
  ;(['push', 'pop', 'shift', 'unshift', 'splice'] as const).forEach(key => {
    instrumentations[key] = function (this: unknown[], ...args: unknown[]) {
      pauseTracking()
      const res = (toRaw(this) as any)[key].apply(this, args)
      resetTracking()
      return res
    }
  })
  return instrumentations
}

/**
 * 这里有一堆针对key单独的判断，这是干嘛呢？
 * 这是在某些地方会有 target[ReactiveFlags.IS_REACTIVE] 这样的访问方式，一开始以为是在target上设置新的属性，但其实是对这些属性进行了拦截，针对不同的key进行不同的操作，返回不同的值。这就是为啥 [RAW]这个键有值，但打印整个target却没有这个键。访问这个属性时，是从缓存的map里找到对应的值
 * 
 */

// createGetter 本身返回的是一个函数，而且将这个函数赋值给一个const变量get，然后组成了mutableHandlers供外面使用
// 通过这样的get set has等，它们这些ProxyHandler最后都是同一个
function createGetter(isReadonly = false, shallow = false) {
  return function get(target: Target, key: string | symbol, receiver: object) {

    // debugger

    // console.log('%c [-- in get]', "background: green;color:white;", target, key);
    
    // 这种写法可以不在对象上显式的添加属性让用户看到,又同时完成了target[key]的访问操作
    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly
    } else if (key === ReactiveFlags.IS_SHALLOW) {
      return shallow
    } else if (
      key === ReactiveFlags.RAW &&
      receiver ===
        (isReadonly
          ? shallow
            ? shallowReadonlyMap
            : readonlyMap
          : shallow
          ? shallowReactiveMap
          : reactiveMap
        ).get(target)
    ) {
      return target
    }

    /**
     * if (isReadyonly) {
     *    if(shallow) {
     *      shallowReadonlyMap
     *    } else {
     *      readonlyMap
     *    }
     * } else {
     *  if(shallow) {
     *    shallowReactiveMap
     *  } else {
     *    reactiveMap
     *  }
     * }
     *    
     */

    const targetIsArray = isArray(target)

    if (!isReadonly && targetIsArray && hasOwn(arrayInstrumentations, key)) {
      return Reflect.get(arrayInstrumentations, key, receiver)
    }

    // debugger
    const res = Reflect.get(target, key, receiver)

    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res
    }

    // debugger
    if (!isReadonly) {
      // reactive 的依赖收集

      // console.log('%c --get中实现track', "background: #0f0; color: #fff;", target, key);
      
      track(target, TrackOpTypes.GET, key)
    }

    if (shallow) {
      // 如果有shallow标记，那就不再reactive下去了，直接返回了
      return res
    }

    if (isRef(res)) {
      // ref unwrapping - skip unwrap for Array + integer key.
      return targetIsArray && isIntegerKey(key) ? res : res.value
    }

    /**
     * 这里到了最后了,对res又进行了一次isObject判断.这是因为 reactive一开始传入的对象有可能是深度嵌套的
     * const person = reactive({info: {name: 'jy'}})
     * 默认下reactive会将整个对象全部转为响应式的,也就是 person.info 和 person.info.name 都是响应式变化的.
     * 当 person.info.name 访问时,先走到对person的调用get(info), 此时res是{name: 'jy'},那么会继续转下去,这样 name这个属性也是响应式的了.这就是对res的判断的目的
     */

    if (isObject(res)) {

      // console.log('如果res仍然是obj,会继续reactive下去', res);
      

      // debugger

      // 这里就是为了能递归的响应式下去,不断的判断是否是Object

      // 如果count是个对象，并且它的第一级属性有基本类型，还有obj类型，那访问 count.value[obj类型]时肯定要走get方法，被拦截到。
      // 被拦截之后，如果res还是个对象，那就会继续响应式的改变下去。所以在第一次ref之后，obj类型属性并不是立马就响应式了，它实际是在第一次被访问时才响应式。

      // Convert returned value into a proxy as well. we do the isObject check
      // here to avoid invalid value warning. Also need to lazy access readonly
      // and reactive here to avoid circular dependency.
      return isReadonly ? readonly(res) : reactive(res)
    }

    // 最后访问 person.info.name就是从这里返回的最终值

    // console.log('-- get return result', res);
    
    return res
  }
}

const set = /*#__PURE__*/ createSetter()
const shallowSet = /*#__PURE__*/ createSetter(true)

function createSetter(shallow = false) {
  return function set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object
  ): boolean {


    /**
     * 一进来,target就是个对象, receiver是对象对应的proxy
     */

    // debugger

    // console.log('--set ', target, key);
    

    let oldValue = (target as any)[key]
    if (isReadonly(oldValue) && isRef(oldValue) && !isRef(value)) {
      return false
    }
    if (!shallow) {
      if (!isShallow(value) && !isReadonly(value)) {
        oldValue = toRaw(oldValue)
        value = toRaw(value)
      }
      if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
        oldValue.value = value
        return true
      }
    } else {
      // in shallow mode, objects are set as-is regardless of reactive or not
    }

    const hadKey =
      isArray(target) && isIntegerKey(key)
        ? Number(key) < target.length
        : hasOwn(target, key)
    const result = Reflect.set(target, key, value, receiver)
    // don't trigger if target is something up in the prototype chain of original
    if (target === toRaw(receiver)) {

      // ??? target 和 receiver 还能是不对应的吗
      
      // console.log('--setter receiver', receiver);
      // console.log('--setter raw receiver', toRaw(receiver));
      
      // console.log(`%c --> will trigger =${key as any}`, "background: red; color: white;");
      

      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, value)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }
    return result
  }
}

function deleteProperty(target: object, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = (target as any)[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}

function has(target: object, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  if (!isSymbol(key) || !builtInSymbols.has(key)) {
    track(target, TrackOpTypes.HAS, key)
  }
  return result
}

function ownKeys(target: object): (string | symbol)[] {
  track(target, TrackOpTypes.ITERATE, isArray(target) ? 'length' : ITERATE_KEY)
  return Reflect.ownKeys(target)
}

export const mutableHandlers: ProxyHandler<object> = {
  get: get,
  set: set,
  deleteProperty,
  has,
  ownKeys
}

export const readonlyHandlers: ProxyHandler<object> = {
  get: readonlyGet,
  set(target, key) {
    if (__DEV__) {
      warn(
        `Set operation on key "${String(key)}" failed: target is readonly.`,
        target
      )
    }
    return true
  },
  deleteProperty(target, key) {
    if (__DEV__) {
      warn(
        `Delete operation on key "${String(key)}" failed: target is readonly.`,
        target
      )
    }
    return true
  }
}

export const shallowReactiveHandlers = /*#__PURE__*/ extend(
  {},
  mutableHandlers,
  {
    get: shallowGet,
    set: shallowSet
  }
)

// Props handlers are special in the sense that it should not unwrap top-level
// refs (in order to allow refs to be explicitly passed down), but should
// retain the reactivity of the normal readonly object.
export const shallowReadonlyHandlers = /*#__PURE__*/ extend(
  {},
  readonlyHandlers,
  {
    get: shallowReadonlyGet
  }
)
