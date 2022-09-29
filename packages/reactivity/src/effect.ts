import { TrackOpTypes, TriggerOpTypes } from './operations'
import { extend, isArray, isIntegerKey, isMap } from '@vue/shared'
import { EffectScope, recordEffectScope } from './effectScope'
import {
  createDep,
  Dep,
  finalizeDepMarkers,
  initDepMarkers,
  newTracked,
  wasTracked
} from './dep'
import { ComputedRefImpl } from './computed'

// The main WeakMap that stores {target -> key -> dep} connections.
// Conceptually, it's easier to think of a dependency as a Dep class
// which maintains a Set of subscribers, but we simply store them as
// raw Sets to reduce memory overhead.
type KeyToDepMap = Map<any, Dep>
const targetMap = new WeakMap<any, KeyToDepMap>()

// The number of effects currently being tracked recursively.
let effectTrackDepth = 0

export let trackOpBit = 1

export let effectCount = 0; // for test
export function showEffectCount() {
  // console.log("%c effect Count in vue", 'color:#fadfa3;background: #030307;',effectCount)
}

/**
 * The bitwise track markers support at most 30 levels of recursion.
 * This value is chosen to enable modern JS engines to use a SMI on all platforms.
 * When recursion depth is greater, fall back to using a full cleanup.
 */
const maxMarkerBits = 30

export type EffectScheduler = (...args: any[]) => any

export type DebuggerEvent = {
  effect: ReactiveEffect
} & DebuggerEventExtraInfo

export type DebuggerEventExtraInfo = {
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}

export let activeEffect: ReactiveEffect | undefined

export function showActiveEffect() {
  // console.log("%c activeEffect in vue", 'color:#fadfa3;background: #030307;',activeEffect)
}

export const ITERATE_KEY = Symbol(__DEV__ ? 'iterate' : '')
export const MAP_KEY_ITERATE_KEY = Symbol(__DEV__ ? 'Map key iterate' : '')

export class ReactiveEffect<T = any> {
  active = true
  deps: Dep[] = []
  parent: ReactiveEffect | undefined = undefined

  /**
   * Can be attached after creation
   * @internal
   */
  computed?: ComputedRefImpl<T>
  /**
   * @internal
   */
  allowRecurse?: boolean
  /**
   * @internal
   */
  private deferStop?: boolean

  onStop?: () => void
  // dev only
  onTrack?: (event: DebuggerEvent) => void
  // dev only
  onTrigger?: (event: DebuggerEvent) => void

  constructor(
    public fn: () => T,
    public scheduler: EffectScheduler | null = null,
    scope?: EffectScope
  ) {

    recordEffectScope(this, scope)
  }

  run() {

    // console.log('-- in effect run()');
    

    // debugger

    if (!this.active) {
      return this.fn()
    }
    let parent: ReactiveEffect | undefined = activeEffect

    // console.log('--effect run, parent', parent);
    // debugger

    let lastShouldTrack = shouldTrack
    while (parent) {
      // console.log('--> into while parent');
      
      if (parent === this) {
        // console.log('parent === this', parent);
        
        debugger

        return
      }
      parent = parent.parent

      // console.log('--while 父级', parent);
      
    }
    try {


      // try 开始时把此前的 effect记录下来,然后切换 affectEffect为this.
      // 这就是为了解决 effect嵌套的问题.
      /**
       * effect(() => {
       *    state.a
       *     effect(() => {
       *        state.b
       *      })
       * 
       *      state.c
       * })
       */

      // 原来是用栈实现的,每次遇到一个新的effect,就放入栈中,然后收集依赖时,取栈顶为当前effect,这样属性收集完依赖之后,在finally里把栈顶退出去
      // 从前是不停的进栈出栈,现在是只通过修改parent引用
      // 不管是栈实现还是parent指针实现,最大的前提是单线程同步执行,如果分为多线程,则无法确定到底当前effect是哪个了
      

      this.parent = activeEffect

      {
        // 我自己的测试代码
        // @ts-ignore
        if(!this["_effect_id_"]) {
          // @ts-ignore
          this['_effect_id_'] = "_effect_id_" + effectCount++;
        }
      }
      

      activeEffect = this

      // console.log("%c --effect run的时候,把activeEffect替换成自己", 'color:#fadfa3;background: #030307;',activeEffect)
      shouldTrack = true

      trackOpBit = 1 << ++effectTrackDepth

      if (effectTrackDepth <= maxMarkerBits) {
        initDepMarkers(this)
      } else {
        cleanupEffect(this)
      }


      // console.log("要去执行一次fn了", this.fn);
      

      // console.log('--看这执行几次.');

      // console.log('--执行fn之前的activeEffect', activeEffect);
      
      // 在fn执行之前,设置对应的effect为activeEffect
      
      return this.fn() //TODO 这个return有什么用呢?不管是什么结果最终都不会return回去,因为一定会走finally.如果要return数据,也只能在finally里return才有效.而且其实没必要return,因为run的时候,就是执行传入effect里的函数,这个函数的返回值又没有地方接收使用,根本不需要返回
    } finally {
      if (effectTrackDepth <= maxMarkerBits) {
        finalizeDepMarkers(this)
      }

      trackOpBit = 1 << --effectTrackDepth


      // 完成后 finally 再把这里记录的 effect还原回来. try 的过程中会调用原本的fn,但是有可能fn会报错,那不能因为fn报错了,就不往下继续了.
      // 使用finally可以使不管在何种情况下,都能把之前的activeEffect还原回来
      activeEffect = this.parent

      // console.log('%c --finally里又把activeEffect替换回去', "color:#fadfa3;background: #030307;", activeEffect);
      

      shouldTrack = lastShouldTrack
      this.parent = undefined

      if (this.deferStop) {
        this.stop()
      }
    }
  }


  stop() {
    // stopped while running itself - defer the cleanup
    if (activeEffect === this) {
      this.deferStop = true
    } else if (this.active) {
      cleanupEffect(this)
      if (this.onStop) {
        this.onStop()
      }
      this.active = false
    }
  }
}

function cleanupEffect(effect: ReactiveEffect) {
  // console.log("cleanupEffect");
  
  
  const { deps } = effect
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}

export interface DebuggerOptions {
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
}

export interface ReactiveEffectOptions extends DebuggerOptions {
  lazy?: boolean
  scheduler?: EffectScheduler
  scope?: EffectScope
  allowRecurse?: boolean
  onStop?: () => void
}

export interface ReactiveEffectRunner<T = any> {
  (): T
  effect: ReactiveEffect
}

/**
 * 返回一个runner，它就是一个方法，fn对应的effect的run方法。绑定了this。
 */
export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions
): ReactiveEffectRunner {

  // debugger

  if ((fn as ReactiveEffectRunner).effect) {
    // TODO 如果传入的fn本身是个被effect包装过之后的runner,那就取出它原本的fn,然后对这个原本的fn进行包装.那这不是一个fn会对应多个effect
    fn = (fn as ReactiveEffectRunner).effect.fn
  }

  const _effect = new ReactiveEffect(fn)
  if (options) {
    extend(_effect, options)
    if (options.scope) recordEffectScope(_effect, options.scope)
  }
  if (!options || !options.lazy) {
    // 如果没有options或者有但是并没有设定是lazy的,那就立即执行一次
    _effect.run()
  }
  const runner = _effect.run.bind(_effect) as ReactiveEffectRunner
  runner.effect = _effect
  return runner
}

export function stop(runner: ReactiveEffectRunner) {
  runner.effect.stop()
}

export let shouldTrack = true
const trackStack: boolean[] = []

export function pauseTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

export function enableTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

export function resetTracking() {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}

export function track(target: object, type: TrackOpTypes, key: unknown) {
  // console.log('--进track了', target, key);
  
  if (shouldTrack && activeEffect) {
    // console.log('真的会track', activeEffect, target, key);
    
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()))
    }
    let dep = depsMap.get(key) // dep就是个Set
    if (!dep) {
      depsMap.set(key, (dep = createDep()))

      // for test
      // @ts-ignore
      dep['__key'] = key
      // console.log("%c 第一次没有dep,新建dep", "background:#aaffee;",  target, key);
      
    }

    // targetMap---target--->depsMap---key--->dep

    const eventInfo = __DEV__
      ? { effect: activeEffect, target, type, key }
      : undefined

    trackEffects(dep, eventInfo)
    // trackEffects 最重要的就是向dep这个Set里添加了activeEffect，这样当target的key对应的值发生变化时，就可以沿着targetMap->depsMap->dep 找到target.key 对应的依赖，然后遍历这里面的effect，就可以执行响应式的“更新”操作了
  }
}

export function trackEffects(
  dep: Dep,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo
) {

  debugger

  let shouldTrack = false
  if (effectTrackDepth <= maxMarkerBits) {
    if (!newTracked(dep)) {
      dep.n |= trackOpBit // set newly tracked
      shouldTrack = !wasTracked(dep)
    }
  } else {
    // Full cleanup mode.
    shouldTrack = !dep.has(activeEffect!)
  }

  if (shouldTrack) {
    
    /**
     * 给定一个target和一个key,它就唯一确定一个对象,这个对象就有唯一确定的dep,但是这个对象可能在不同的watchEffect里调用了,那么这个对象就对应了很多的ReactiveEffect实例,所以用dep这个Set来记录
     * 
     * 同时,一个watchEffect的回调了,可以访问很多属性,那这个effect其实也对应了很多的dep,所以也要push保存起来
     */
    
    dep.add(activeEffect!)
    activeEffect!.deps.push(dep)

    // console.log("%c >>>>这里才是真的记录了track关系<<<",  "background: #eeff00;",dep, activeEffect);

    if (__DEV__ && activeEffect!.onTrack) {
      activeEffect!.onTrack({
        effect: activeEffect!,
        ...debuggerEventExtraInfo!
      })
    }
  }
}

export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>
) {
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    // never been tracked
    return
  }

  let deps: (Dep | undefined)[] = []
  if (type === TriggerOpTypes.CLEAR) {
    // collection being cleared
    // trigger all effects for target
    deps = [...depsMap.values()]
  } else if (key === 'length' && isArray(target)) {
    depsMap.forEach((dep, key) => {
      if (key === 'length' || key >= (newValue as number)) {
        deps.push(dep)
      }
    })
  } else {
    // schedule runs for SET | ADD | DELETE
    if (key !== void 0) {
      //  这一下子就能把跟key有关的effect全找出来,因为都在 depsMap.get(key) 这个Set里
      deps.push(depsMap.get(key))
    }

    // also run for iteration key on ADD | DELETE | Map.SET
    switch (type) {
      case TriggerOpTypes.ADD:
        if (!isArray(target)) {
          deps.push(depsMap.get(ITERATE_KEY))
          if (isMap(target)) {
            deps.push(depsMap.get(MAP_KEY_ITERATE_KEY))
          }
        } else if (isIntegerKey(key)) {
          // new index added to array -> length changes
          deps.push(depsMap.get('length'))
        }
        break
      case TriggerOpTypes.DELETE:
        if (!isArray(target)) {
          deps.push(depsMap.get(ITERATE_KEY))
          if (isMap(target)) {
            deps.push(depsMap.get(MAP_KEY_ITERATE_KEY))
          }
        }
        break
      case TriggerOpTypes.SET:
        if (isMap(target)) {
          deps.push(depsMap.get(ITERATE_KEY))
        }
        break
    }
  }

  const eventInfo = __DEV__
    ? { target, type, key, newValue, oldValue, oldTarget }
    : undefined

  if (deps.length === 1) {
    if (deps[0]) {
      if (__DEV__) {
        triggerEffects(deps[0], eventInfo)
      } else {
        triggerEffects(deps[0])
      }
    }
  } else {
    const effects: ReactiveEffect[] = []
    for (const dep of deps) {
      if (dep) {
        effects.push(...dep)
      }
    }
    if (__DEV__) {
      triggerEffects(createDep(effects), eventInfo)
    } else {
      triggerEffects(createDep(effects))
    }
  }
}

export function triggerEffects(
  dep: Dep | ReactiveEffect[],
  debuggerEventExtraInfo?: DebuggerEventExtraInfo
) {
  // spread into array for stabilization
  const effects = isArray(dep) ? dep : [...dep]
  for (const effect of effects) {
    if (effect.computed) {
      triggerEffect(effect, debuggerEventExtraInfo)
    }
  }
  for (const effect of effects) {
    if (!effect.computed) {
      triggerEffect(effect, debuggerEventExtraInfo)
    }
  }
}

function triggerEffect(
  effect: ReactiveEffect,
  debuggerEventExtraInfo?: DebuggerEventExtraInfo
) {
  if (effect !== activeEffect || effect.allowRecurse) {
    if (__DEV__ && effect.onTrigger) {
      effect.onTrigger(extend({ effect }, debuggerEventExtraInfo))
    }

    // console.log('--iin triggerEffect', effect);
    
    // debugger
    if (effect.scheduler) {

      // 这里跟effect方法创建ReactiveEffect有关.effect可以通过options传入sheduler参数,这样effect的触发流程就会改变,走到这里时,会先scheduler再run
      // console.log("-----------> triggerEffect, effect.scheduler");
      
      effect.scheduler()
    } else {
      
      // console.log("-----------> triggerEffect, effect.run");
      effect.run()
    }
  }
}
