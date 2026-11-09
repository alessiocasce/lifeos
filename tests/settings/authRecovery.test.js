import test from 'node:test';
import assert from 'node:assert/strict';
import { readRecoveryReturn } from '../../src/utils/authRecovery.js';

test('recovery routing distinguishes validated-session candidates from expired/error redirects',()=>{
  assert.deepEqual(readRecoveryReturn('#type=recovery&access_token=secret'),{recovery:true,expired:false});
  assert.deepEqual(readRecoveryReturn('#error=access_denied&error_code=otp_expired&error_description=private'),{recovery:false,expired:true});
  assert.deepEqual(readRecoveryReturn('#type=recovery&error=access_denied'),{recovery:false,expired:true});
  assert.deepEqual(readRecoveryReturn(''),{recovery:false,expired:false});
});
