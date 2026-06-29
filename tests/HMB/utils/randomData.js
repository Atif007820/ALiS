import { fakerEN_US as faker } from '@faker-js/faker';

const FIRST_NAMES = [
  'Adam', 'Anna', 'Ben', 'Bella', 'Chris', 'Daisy', 'Ella', 'Emma',
  'Evan', 'Grace', 'Henry', 'Jack', 'James', 'Jane', 'John', 'Kate',
  'Kevin', 'Leo', 'Liam', 'Lily', 'Lucy', 'Mark', 'Mia', 'Noah',
  'Nora', 'Olivia', 'Owen', 'Paul', 'Rose', 'Ryan', 'Sam', 'Sara',
  'Sophie', 'Tom', 'Will', 'Zoe',
];

const LAST_NAMES = [
  'Adams', 'Baker', 'Brown', 'Clark', 'Davis', 'Evans', 'Green',
  'Hall', 'Hill', 'Jones', 'King', 'Lee', 'Lewis', 'Martin', 'Miller',
  'Moore', 'Parker', 'Reed', 'Scott', 'Smith', 'Taylor', 'Walker',
  'White', 'Wilson', 'Young',
];

const US_CITIES = [
  'Albany', 'Austin', 'Boston', 'Charlotte', 'Chicago', 'Columbus',
  'Dallas', 'Denver', 'Houston', 'Jackson', 'Las Vegas', 'Lincoln',
  'Madison', 'Miami', 'Newark', 'Orlando', 'Phoenix', 'Raleigh',
  'Richmond', 'Sacramento', 'Seattle', 'Trenton',
];

export const pick = (values) => faker.helpers.arrayElement(values);
export const digits = (length) => faker.string.numeric(length);
export const firstName = () => pick(FIRST_NAMES);
export const lastName = () => pick(LAST_NAMES);
export const fullName = () => `${firstName()} ${lastName()}`;
export const phone = () => `${faker.number.int({ min: 200, max: 999 })}-${faker.number.int({ min: 200, max: 999 })}-${digits(4)}`;
export const primaryPhone = phone;
export const alternatePhone = phone;
export const fax = phone;
export const zip = () => `${digits(5)}-${digits(4)}`;
export const city = () => pick(US_CITIES);
export const letters = (length) => faker.string.alpha({ length, casing: 'upper' });
export const address = () => `${letters(3)} ${pick(['Buliding', 'Apartments'])}`;
export const apt = () => `${pick(['Suite', 'Apt', 'Unit'])} - ${digits(2)}`;

export function timestampName(prefix = 'HMB') {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const dd = pad(now.getDate());
  const mm = pad(now.getMonth() + 1);
  const yyyy = now.getFullYear();
  const hours24 = now.getHours();
  const hours12 = hours24 % 12 || 12;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const time = `${pad(hours12)}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${meridiem}`;
  return `${prefix}_${dd}-${mm}-${yyyy}_${time}`;
}

export function loginName(prefix = 'HMB') {
  const shortNumber = faker.number.int({ min: 1, max: 9999 });
  const uniqueness = String(Date.now()).slice(-4);
  return `${prefix}_${shortNumber}${uniqueness}`;
}
