
/**
 * 从array里找出比target大的下一个数的index
 * 这是个vue里的辅助函数，一定能找到。
 * array的要求是，1.元素值是递增的的 2.数组最后一个数肯定比target大，
 * 所以一定能找到一个位置
 * @param array 
 * @param target 
 * 
 * 这个方法好使是有前提条件的
 */
function findNextToSelf(array: any, target: any) {
  if(target < array[0]) {
    return 0
  }
  let left = 0;
  let right = array.length-1;
  let mid;
  while(left<=right) {
    mid = (left + right)>>1
    if(array[mid] == target) {
      return mid+1;
    } else if(array[mid]>target) {
      right = mid-1;
    } else if(array[mid] < target) {
      left = mid+1
    }
  }
  return left
}

let array = [1,2,3,4,5, 6]
let target = 3;

console.log(findNextToSelf(array, target))

array = [4,5,6]
console.log(findNextToSelf(array, target));

array = [1,2,7,9]
console.log(findNextToSelf(array, target))

array = [-1,0,1,2,5]
console.log(findNextToSelf(array, target))

array = [-10,-5,-1,0,1,2,5];
console.log(findNextToSelf(array, target))


/**
 * 二分法在递增数组里找自己的位置，普通做法就是定义left，right，mid，然后不断的去比较，压缩空间。
 * 但可以在此基础上更高效一点。
 * 既然是递增的数组，那上来就比较left和right两个位置与target的大小。
 * 1. 如果[left] > target， 那后面的值肯定比target大，那自然数组里也就找不到target，可以直接返回-1
 * 2. 如果[right] < target, 那同样的道理，数组里也不会找到target，也可以直接返回-1
 * 如果不这么做，以[left] > target为例，结果就是找不到，返回-1，但整个查找过程就很复杂：
 *    先看[mid] > target， 然后压缩right，然后再计算[mid]，又[mid]>target，再继续压缩right。。。最后left<=right条件不满足了，跳出判断，返回-1，这中间做的所有操作都是浪费的。
 * 
 * 
 * 一般二分查找时，数组都是不重复的。
 * 如果数组值是可以重复的，那依然能找到位置。找到一个位置之后，以这个位置为中心往两边扩散，就可以把所有位置找出来。
 */

// {
//   let left,right,mid

// while(left<=right) {
//   if(array[left] > target) {
//     return -1
//   } else if(array[right] < target) {
//     return -1
//   } else {
//     mid = (left+right)>>1
//     if(array[mid] == target) {
//       return mid
//     } else if(array[mid] > target) {
//       right = mid-1
//     } else { // array[mid] < target
//       left = mid+1
//     }
//   }
// }
// // 能确定结果早就return了。走到这了那就是没有
// return -1
// }