import { nextProductPage } from '@/utils/productPagination';
describe('incremental mobile product loading',()=>{
 it('uses server page counts when page size is capped',()=>{
  expect(nextProductPage({pagination:{totalPages:3}},1,10)).toBe(2);
  expect(nextProductPage({pagination:{totalPages:3}},3,10)).toBeUndefined();
 });
 it('uses total counts and stops after the last page',()=>{
  expect(nextProductPage({count:25},1,20)).toBe(2);
  expect(nextProductPage({count:25},2,5)).toBeUndefined();
 });
 it('handles older responses without pagination',()=>{
  expect(nextProductPage({},1,20)).toBe(2);
  expect(nextProductPage({},2,3)).toBeUndefined();
 });
 it('stops empty responses even with a stale total',()=>{
  expect(nextProductPage({count:100},2,0)).toBeUndefined();
 });
});
