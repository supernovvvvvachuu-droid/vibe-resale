import test from 'node:test';
import assert from 'node:assert/strict';
import {validatedExternalUrl} from '../js/link-policy.mjs';

test('contact links allow only direct official HTTPS Avito and Telegram addresses',()=>{
  for(const url of [
    'https://avito.ru/moskva/kurtka_123',
    'https://www.avito.ru/moskva/odezhda/plate_987654321',
    'https://t.me/my_shop',
    'https://t.me/my_shop/42',
    'https://t.me/s/my_shop/42',
  ])assert.equal(validatedExternalUrl(url),url);
  assert.equal(validatedExternalUrl('HTTPS://WWW.AVITO.RU/moskva/kurtka_123'),'https://www.avito.ru/moskva/kurtka_123');
});

test('other marketplaces, shorteners and official-looking destinations are rejected',()=>{
  for(const url of [
    'https://meshok.net/item/123','https://www.meshok.net/item/123',
    'https://etsy.com/listing/123','https://www.etsy.com/listing/123',
    'https://depop.com/products/shop','https://www.depop.com/products/shop',
    'https://vinted.com/items/123','https://www.vinted.com/items/123',
    'https://bit.ly/example','https://t.co/example','https://tinyurl.com/example',
    'https://avito.ru.evil.test/kurtka_123','https://t.me.evil.test/my_shop',
    'https://m.avito.ru/kurtka_123','https://www.t.me/my_shop',
    'https://evil.test/https://avito.ru/kurtka_123',
  ])assert.equal(validatedExternalUrl(url),null,url);
});

test('URL normalization cannot hide credentials, ports, encoded or Unicode hosts',()=>{
  for(const url of [
    'https://avito.ru@evil.test/kurtka_123','https://name:password@avito.ru/kurtka_123',
    'https://t.me@evil.test/my_shop','https://name@t.me/my_shop',
    'https://avito.ru:443/kurtka_123','https://t.me:443/my_shop',
    'https://avito.ru:8443/kurtka_123','https://avito.ru./kurtka_123',
    'https://%61vito.ru/kurtka_123','https://%74.me/my_shop',
    'https://avito\u3002ru/kurtka_123','https://avito\uff0eru/kurtka_123',
    'https://www.avi\tto.ru/kurtka_123','https://avito.ru/kurtka_123\n',
    ' https://avito.ru/kurtka_123','https://t.me/my_shop\u200b',
  ])assert.equal(validatedExternalUrl(url),null,url);
});

test('redirects, tracking and executable URL schemes never become contact links',()=>{
  for(const url of [
    'http://avito.ru/kurtka_123','//avito.ru/kurtka_123','ftp://avito.ru/kurtka_123',
    'javascript:alert(1)','data:text/html,<script>alert(1)</script>',
    'https://avito.ru/kurtka_123?next=https://evil.test','https://avito.ru/kurtka_123#fragment',
    'https://avito.ru/redirect/../kurtka_123','https://avito.ru/%2e%2e/kurtka_123',
    'https://avito.ru/%252e%252e/kurtka_123','https://avito.ru/out/kurtka_123',
    'https://avito.ru//kurtka_123','https://avito.ru/kurtka_0',
    'https://t.me/share?url=https://evil.test','https://t.me/login',
    'https://t.me/proxy','https://t.me/c/123','https://t.me/+join-code',
    'https://t.me/my_shop?start=payload','https://t.me/my_shop/42#x',
    'https://t.me/shoppingbot','https://t.me/my_shop/%2f42',
  ])assert.equal(validatedExternalUrl(url),null,url);
});

test('unexpected contact values fail closed without throwing',()=>{
  for(const value of [undefined,null,false,1,{},[],new URL('https://t.me/my_shop'),'','x'.repeat(1001)])assert.equal(validatedExternalUrl(value),null);
});
