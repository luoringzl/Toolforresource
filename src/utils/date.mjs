export function localDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year=String(date.getFullYear()).padStart(4,'0');
  const month=String(date.getMonth()+1).padStart(2,'0');
  const day=String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}

export function localDateTimeStamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const datePart=localDateKey(date);
  const hour=String(date.getHours()).padStart(2,'0');
  const minute=String(date.getMinutes()).padStart(2,'0');
  const second=String(date.getSeconds()).padStart(2,'0');
  return `${datePart} ${hour}:${minute}:${second}`;
}
