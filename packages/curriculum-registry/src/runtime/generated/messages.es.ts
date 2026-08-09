/* eslint-disable */
// AUTO-GENERATED canonical curriculum messages for es.
const messages: Record<string, any> = {
  "topics": {
    "sql": {
      "sql_module_5": {
        "adding-and-subtracting": {
          "label": "Sumar y restar",
          "summary": "Aprende cómo usar la suma y la resta en columnas calculadas de SQL para crear nuevos valores en tus consultas.",
          "cards": {
            "sketch0": {
              "title": "¿Qué son las columnas calculadas?"
            },
            "sketch1": {
              "title": "Sumar y restar en SELECT"
            },
            "sketch2": {
              "title": "Usar alias para mayor claridad"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "quiz-1": {
              "title": "Calcula el total de línea para cada pedido",
              "prompt": "Escribe una consulta SQL para mostrar el id de cada pedido, customer_name, quantity, unit_price y una columna calculada llamada line_total (quantity * unit_price) de la tabla orders.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "-- Escribe tu consulta abajo"
            },
            "quiz-2": {
              "title": "Resta un descuento fijo a cada pedido",
              "prompt": "Escribe una consulta SQL para mostrar id, customer_name y una nueva columna llamada discounted_total que reste 10 al total de línea (quantity * unit_price) para cada pedido.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "-- Escribe tu consulta abajo"
            },
            "quiz-3": {
              "title": "¿Qué operador se usa para la resta en expresiones SQL?",
              "prompt": "¿Qué símbolo usas para restar una columna o valor de otro en una sentencia SELECT de SQL?",
              "hint": "Es el mismo símbolo que se usa para la resta en aritmética básica.",
              "help": {
                "concept": "SQL usa operadores aritméticos estándar: + para suma, - para resta, * para multiplicación y / para división.",
                "hint_1": "Piensa en qué símbolo usas para restar números en matemáticas.",
                "hint_2": "No es el símbolo de suma, multiplicación ni división."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "quiz-4": {
              "title": "¿Cuáles de las siguientes son columnas calculadas válidas en SQL?",
              "prompt": "Selecciona todas las expresiones de abajo que podrían usarse como columnas calculadas en una sentencia SELECT.",
              "hint": "Considera qué operadores son válidos para la aritmética en SQL.",
              "help": {
                "concept": "SQL admite +, -, * y / para cálculos aritméticos en sentencias SELECT. El operador & no se usa para aritmética en SQL.",
                "hint_1": "Busca expresiones que usen operadores matemáticos estándar.",
                "hint_2": "El símbolo & no es un operador aritmético en SQL."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "quiz-5": {
              "title": "Completa el espacio en blanco: Sumar una tarifa fija",
              "prompt": "Elige el mejor valor para el primer espacio en blanco que falta en la declaración.",
              "hint": "El espacio en blanco debe llenarse con el monto de la tarifa fija.",
              "help": {
                "concept": "Para sumar un valor fijo a una columna calculada, simplemente usa el número en la expresión.",
                "hint_1": "Quieres sumar el número que falta al total calculado.",
                "hint_2": "No uses el nombre de una columna; usa el monto real de la tarifa."
              },
              "template": "El primer valor que falta es [blank1].",
              "choices": [
                "3",
                "quantity",
                "unit_price",
                "shipping",
                "fee"
              ]
            }
          }
        },
        "as": {
          "label": "AS",
          "summary": "AS en columnas calculadas y expresiones SQL",
          "cards": {
            "sketch0": {
              "title": "¿Qué es AS en SQL?"
            },
            "sketch1": {
              "title": "¿Por qué usar alias de columna?"
            },
            "sketch2": {
              "title": "Alias con funciones y expresiones"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "q1": {
              "title": "Calcular y asignar un alias a una columna",
              "prompt": "Escribe una consulta SQL para seleccionar `customer_name` y una columna calculada para el valor total de cada pedido (cantidad multiplicada por unit_price), etiquetada como `order_total`, de la tabla `orders`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "-- Escribe tu consulta aquí"
            },
            "q2": {
              "title": "Uso de AS con funciones",
              "prompt": "Escribe una consulta SQL para seleccionar `customer_name` y la versión en mayúsculas de `region` (usando la función UPPER), etiquetada como `region_upper`, de la tabla `orders`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "-- Escribe tu consulta aquí"
            },
            "q3": {
              "title": "Propósito de AS",
              "prompt": "¿Cuál es el propósito principal de la palabra clave AS en una sentencia SELECT de SQL?",
              "hint": "Piensa en cómo AS cambia la salida.",
              "help": {
                "concept": "AS se usa para asignar un alias a una columna o expresión, haciendo la salida más legible.",
                "hint_1": "AS no afecta el filtrado, unión ni ordenamiento.",
                "hint_2": "Principalmente se trata de nombrar columnas en tu resultado."
              },
              "options": {
                "a": "a. Para filtrar filas según una condición",
                "b": "b. Para renombrar una columna o expresión en el conjunto de resultados",
                "c": "c. Para unir dos tablas",
                "d": "d. Para ordenar los resultados"
              }
            },
            "q4": {
              "title": "¿Dónde puedes usar AS?",
              "prompt": "¿En cuál de los siguientes escenarios puedes usar la palabra clave AS en una sentencia SELECT de SQL? (Elige todas las que correspondan)",
              "hint": "AS es flexible con columnas y expresiones.",
              "help": {
                "concept": "AS se usa para alias de columnas y expresiones en SELECT, no para filtrar ni para alias de tablas en FROM.",
                "hint_1": "Piensa en dónde quieres cambiar el nombre de la columna en la salida.",
                "hint_2": "AS no se usa para filtrar ni para renombrar tablas en la cláusula FROM."
              },
              "options": {
                "a": "a. Para renombrar una columna calculada",
                "b": "b. Para renombrar una columna resultante de una función",
                "c": "c. Para renombrar una tabla en la cláusula FROM",
                "d": "d. Para filtrar filas según una condición"
              }
            },
            "q5": {
              "title": "Rellena el espacio en blanco: Sintaxis de alias",
              "prompt": "Elige el mejor valor para el primer espacio en blanco que falta en la declaración.",
              "hint": "Concéntrate en el concepto SQL que falta en vez de la palabra exacta.",
              "help": {
                "concept": "El espacio en blanco debe llenarse con el término SQL que corresponde a la función que la declaración intenta realizar.",
                "hint_1": "Piensa en lo que se supone que debe hacer la parte faltante en la declaración.",
                "hint_2": "Elige el término SQL que mejor complete el significado de la declaración."
              },
              "template": "El primer valor que falta es [blank1].",
              "choices": [
                "AS",
                "WITH",
                "BY",
                "INTO"
              ]
            }
          }
        },
        "date-function-awareness": {
          "label": "Conciencia de funciones de fecha",
          "summary": "Aprende a reconocer y usar funciones de fecha en expresiones SQL, especialmente para columnas calculadas e informes.",
          "cards": {
            "sketch0": {
              "title": "¿Qué son las funciones de fecha en SQL?"
            },
            "sketch1": {
              "title": "Uso de funciones de fecha en columnas calculadas"
            },
            "sketch2": {
              "title": "Filtrado con funciones de fecha"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "q1": {
              "title": "Extraer el año de order_date",
              "prompt": "Escribe una consulta SQL para seleccionar el `id`, `order_date` y una columna calculada llamada `order_year` que contenga la parte del año de `order_date` de la tabla `orders`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se adapte a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT id, order_date\n-- Agrega la columna calculada aquí\nFROM orders;"
            },
            "q2": {
              "title": "Filtrar pedidos por mes usando una función de fecha",
              "prompt": "Escribe una consulta SQL para seleccionar todas las columnas de `orders` donde el pedido se realizó en enero (mes = '01').",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se adapte a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT *\nFROM orders\n-- Agrega tu cláusula WHERE aquí;"
            },
            "q3": {
              "title": "Propósito de las funciones de fecha",
              "prompt": "¿Cuál de las siguientes opciones describe mejor el propósito de las funciones de fecha en SQL?",
              "hint": "Piensa en lo que puedes hacer con fechas en SQL.",
              "help": {
                "concept": "Las funciones de fecha te ayudan a manipular y extraer información de columnas de fecha.",
                "hint_1": "Se usan para obtener partes de una fecha o realizar cálculos con fechas.",
                "hint_2": "No se usan para formatear números ni unir tablas."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q4": {
              "title": "Reconociendo el uso de funciones de fecha",
              "prompt": "¿Cuál de las siguientes expresiones SQL usa una función de fecha? Selecciona todas las que correspondan.",
              "hint": "Busca funciones que operen sobre valores de fecha.",
              "help": {
                "concept": "Las funciones de fecha incluyen funciones como `strftime`, `date` y `datetime` que trabajan con columnas de fecha.",
                "hint_1": "Verifica si la función se usa para extraer o manipular información de fecha.",
                "hint_2": "No todas las funciones mostradas están relacionadas con fechas."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q5": {
              "title": "Extrayendo el mes de una fecha",
              "prompt": "¿Qué función usarías para extraer el mes de la columna `order_date` en SQLite?",
              "hint": "Piensa en qué función puede extraer la parte del mes de una fecha.",
              "help": {
                "concept": "Para extraer el mes de una fecha en SQLite, usas una función que puede formatear o extraer partes de la fecha.",
                "hint_1": "Busca una función que tome una fecha y una cadena de formato.",
                "hint_2": "La función comienza con 'str' y se usa comúnmente para formatear fechas."
              },
              "template": "SELECT id, order_date, _____ AS order_month FROM orders;",
              "choices": [
                "strftime('%m', order_date)",
                "sum(order_date)",
                "date(order_date)",
                "substr(order_date, 6, 2)"
              ]
            }
          }
        },
        "discount-calculations": {
          "label": "Cálculos de descuentos",
          "summary": "Aprende cómo calcular descuentos y crear nuevas columnas usando expresiones y alias de SQL en el conjunto de datos sales_kpi.",
          "cards": {
            "sketch0": {
              "title": "¿Qué son los cálculos de descuentos en SQL?"
            },
            "sketch1": {
              "title": "Uso de múltiples columnas en expresiones"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "q1": {
              "title": "Calcular un precio con 20% de descuento",
              "prompt": "Escribe una consulta SQL para mostrar el id de cada pedido, customer_name, unit_price y una nueva columna llamada discounted_price que muestre el unit_price después de un 20% de descuento. Usa la tabla orders.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en vez de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT id, customer_name, unit_price, \n       -- tu expresión aquí\nFROM orders;"
            },
            "q2": {
              "title": "Calcular el total de línea con descuento",
              "prompt": "Escribe una consulta SQL para mostrar id, quantity, unit_price y una nueva columna llamada discounted_total que muestre el precio total de cada pedido después de un 10% de descuento. Usa la tabla orders.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en vez de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT id, quantity, unit_price, \n       -- tu expresión aquí\nFROM orders;"
            },
            "q3": {
              "title": "Propósito de los alias de columna",
              "prompt": "¿Por qué deberías usar alias de columna al calcular descuentos en SQL?",
              "hint": "Piensa en cómo se ve el resultado para alguien que lee los resultados.",
              "help": {
                "concept": "Los alias hacen que las columnas de resultados sean más fáciles de entender al darles nombres claros y descriptivos.",
                "hint_1": "Los alias ayudan a que la salida sea más legible.",
                "hint_2": "Sin alias, las columnas calculadas pueden tener nombres confusos o poco claros."
              },
              "options": {
                "a": "a. Para que las columnas de salida sean más fáciles de entender",
                "b": "b. Para acelerar la ejecución de la consulta",
                "c": "c. Para evitar usar aritmética en SQL",
                "d": "d. Para ocultar columnas del resultado"
              }
            },
            "q4": {
              "title": "¿Qué expresiones calculan un descuento del 25%?",
              "prompt": "Selecciona todas las expresiones que calculan correctamente un descuento del 25% sobre unit_price.",
              "hint": "Un descuento del 25% significa conservar el 75% del precio.",
              "help": {
                "concept": "Para aplicar un descuento del 25%, multiplica el precio por 0.75 o resta el 25% del precio al original.",
                "hint_1": "Multiplicar por 0.75 o restar unit_price * 0.25 ambos funcionan.",
                "hint_2": "Verifica qué opciones conservan el 75% del precio o restan el 25% al original."
              },
              "options": {
                "a": "a. unit_price * 0.75",
                "b": "b. unit_price - (unit_price * 0.25)",
                "c": "c. unit_price * 1.25",
                "d": "d. unit_price + (unit_price * 0.25)"
              }
            },
            "q5": {
              "title": "Completa el espacio en blanco: factor de descuento",
              "prompt": "Si quieres aplicar un descuento del 15% a unit_price, ¿por qué número deberías multiplicar unit_price?",
              "hint": "Resta la tasa de descuento a 1.",
              "help": {
                "concept": "El factor de descuento es 1 menos la tasa de descuento (como decimal).",
                "hint_1": "Un descuento del 15% significa conservar el 85% del precio.",
                "hint_2": "Convierte 85% a decimal."
              },
              "template": "unit_price * [BLANK]",
              "choices": [
                "0.85",
                "0.15",
                "1.15",
                "0.75"
              ]
            }
          }
        },
        "intro-to-functions": {
          "label": "Introducción a las funciones",
          "summary": "Introducción a las funciones en Columnas Calculadas y Expresiones SQL",
          "cards": {
            "sketch0": {
              "title": "¿Qué es una función SQL?"
            },
            "sketch1": {
              "title": "Usando funciones en SELECT"
            },
            "sketch2": {
              "title": "Combinando funciones con expresiones"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "q1": {
              "title": "Calcular y redondear totales de línea",
              "prompt": "Escribe una consulta SQL para seleccionar el id del pedido y el precio total de cada pedido, redondeado al número entero más cercano. Nombra la columna redondeada `rounded_total`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que el ejercicio te pide hacer."
              },
              "starterCode": "SELECT id, /* tu expresión aquí */ FROM orders;"
            },
            "q2": {
              "title": "Usar una función de texto",
              "prompt": "Escribe una consulta SQL para seleccionar el customer_name y una nueva columna llamada `upper_name` que muestre el nombre del cliente en mayúsculas.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que el ejercicio te pide hacer."
              },
              "starterCode": "SELECT customer_name, /* tu función aquí */ FROM orders;"
            },
            "q3": {
              "title": "Propósito de las funciones SQL",
              "prompt": "¿Cuál es el propósito principal de usar funciones en una sentencia SELECT de SQL?",
              "hint": "Piensa en cómo las funciones cambian o resumen los datos.",
              "help": {
                "concept": "Las funciones en SQL se usan para transformar, calcular o resumir valores de datos en consultas.",
                "hint_1": "Las funciones pueden procesar valores para crear nuevos resultados.",
                "hint_2": "Te ayudan a modificar o calcular nuevos valores a partir de columnas existentes."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q4": {
              "title": "Identificando funciones SQL",
              "prompt": "¿Cuáles de los siguientes son ejemplos de funciones SQL? (Elige todas las que correspondan)",
              "hint": "Busca operaciones que tomen valores de entrada y devuelvan un resultado.",
              "help": {
                "concept": "Las funciones SQL procesan valores de entrada y devuelven un resultado, como operaciones matemáticas o de texto.",
                "hint_1": "Funciones como ROUND y UPPER operan sobre valores de columnas.",
                "hint_2": "SELECT, ROUND y UPPER no son todos el mismo tipo de palabra clave SQL."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q5": {
              "title": "Completa el espacio en blanco: uso de funciones",
              "prompt": "Elige el mejor valor para el primer espacio en blanco que falta en la declaración.",
              "hint": "El alias es el nuevo nombre de la columna.",
              "help": {
                "concept": "La palabra clave AS te permite renombrar la salida de una función o expresión en SQL.",
                "hint_1": "Elige un nombre que describa la versión en minúsculas del nombre del cliente.",
                "hint_2": "Un alias común es 'el término que falta' o algo similar."
              },
              "template": "El primer valor que falta es [blank1].",
              "choices": [
                "lower_name",
                "customer_lower",
                "name_lower",
                "customername",
                "customer"
              ]
            }
          }
        },
        "math-in-sql": {
          "label": "Matemáticas en SQL",
          "summary": "Matemáticas en SQL en columnas calculadas y expresiones SQL",
          "cards": {
            "sketch0": {
              "title": "Uso de operaciones aritméticas en SQL SELECT"
            },
            "sketch1": {
              "title": "Renombrar columnas calculadas con alias"
            },
            "sketch2": {
              "title": "Expresiones y valores NULL"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "code-1": {
              "title": "Calcular el total de línea para cada pedido",
              "prompt": "Escribe una consulta SQL para seleccionar `id`, `quantity`, `unit_price` y una nueva columna llamada `line_total` que multiplique `quantity` por `unit_price` para cada pedido en la tabla `orders`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el papel o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT id, quantity, unit_price\nFROM orders;"
            },
            "code-2": {
              "title": "Aplicar un descuento del 10% a cada pedido",
              "prompt": "Escribe una consulta SQL para seleccionar `id`, `customer_name` y una nueva columna llamada `discounted_total` que muestre el total después de aplicar un 10% de descuento al total de línea (`quantity * unit_price`).",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el papel o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT id, customer_name\nFROM orders;"
            },
            "single-1": {
              "title": "Comprendiendo las expresiones SQL",
              "prompt": "¿Cuál de las siguientes es una expresión SQL válida para crear una nueva columna que duplique la cantidad en la tabla `orders`?",
              "hint": "Busca una expresión que multiplique quantity por 2.",
              "help": {
                "concept": "Una expresión SQL puede usar operadores aritméticos para crear nuevos valores en la cláusula SELECT.",
                "hint_1": "Duplicar significa multiplicar por 2.",
                "hint_2": "Revisa qué opción usa el operador de multiplicación con quantity."
              },
              "options": {
                "a": "a. SELECT quantity + 2 AS double_quantity FROM orders;",
                "b": "b. SELECT quantity * 2 AS double_quantity FROM orders;",
                "c": "c. SELECT quantity / 2 AS double_quantity FROM orders;",
                "d": "d. SELECT quantity - 2 AS double_quantity FROM orders;"
              }
            },
            "multi-1": {
              "title": "Elegir los alias correctos en SQL",
              "prompt": "¿Cuáles de las siguientes consultas usan correctamente alias para renombrar columnas calculadas? Selecciona todas las que correspondan.",
              "hint": "Busca el uso de AS para asignar un nuevo nombre a una columna calculada.",
              "help": {
                "concept": "Los alias en SQL se crean usando la palabra clave AS para renombrar columnas, especialmente las calculadas.",
                "hint_1": "Revisa el uso correcto de AS para asignar un nuevo nombre de columna.",
                "hint_2": "Solo las opciones que usan AS correctamente son alias válidos."
              },
              "options": {
                "a": "a. SELECT quantity * unit_price AS total FROM orders;",
                "b": "b. SELECT quantity * unit_price total FROM orders;",
                "c": "c. SELECT quantity * unit_price AS total_amount FROM orders;",
                "d": "d. SELECT quantity * unit_price = total FROM orders;"
              }
            },
            "fill-1": {
              "title": "Efecto de NULL en operaciones aritméticas en SQL",
              "prompt": "Si la columna `quantity` es NULL para una fila, ¿cuál será el resultado de `quantity * unit_price` para esa fila?",
              "hint": "Piensa en cómo maneja SQL las operaciones aritméticas con valores faltantes.",
              "help": {
                "concept": "En SQL, cualquier operación aritmética que involucre el término faltante da como resultado el término faltante.",
                "hint_1": "el término faltante en los cálculos lleva a un resultado faltante.",
                "hint_2": "SQL trata el término faltante como 'desconocido', por lo que el resultado no puede determinarse."
              },
              "template": "El resultado será: ___",
              "choices": [
                "0",
                "NULL",
                "unit_price",
                "quantity"
              ]
            }
          }
        },
        "multiplying-and-dividing": {
          "label": "Multiplicación y división",
          "summary": "Multiplicación y división en columnas calculadas y expresiones SQL",
          "cards": {
            "sketch0": {
              "title": "Multiplicar columnas en SQL"
            },
            "sketch1": {
              "title": "Dividir columnas en SQL"
            },
            "sketch2": {
              "title": "Uso de alias para mayor legibilidad"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "q1": {
              "title": "Calcular el total de línea para cada pedido",
              "prompt": "Escribe una consulta SQL para seleccionar el `id`, `quantity`, `unit_price` y una nueva columna llamada `line_total` (que es `quantity` multiplicado por `unit_price`) de la tabla `orders`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en vez de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT id, quantity, unit_price\nFROM orders;"
            },
            "q2": {
              "title": "Calcular el precio unitario promedio por pedido",
              "prompt": "Escribe una consulta SQL para seleccionar el `id`, `quantity`, `unit_price` y una nueva columna llamada `avg_price` que divida el valor total del pedido (`quantity * unit_price`) por la `quantity` de cada pedido.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en vez de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT id, quantity, unit_price\nFROM orders;"
            },
            "q3": {
              "title": "Propósito de usar alias en columnas calculadas",
              "prompt": "¿Por qué deberías usar la palabra clave `AS` para dar un alias a una columna calculada en SQL?",
              "hint": "Piensa en cómo se ve la salida y cómo te refieres a las columnas.",
              "help": {
                "concept": "Los alias hacen que tu conjunto de resultados sea más fácil de leer y te permiten referirte a columnas calculadas con un nombre claro.",
                "hint_1": "Sin un alias, el nombre de la columna es toda la expresión.",
                "hint_2": "Los alias mejoran la legibilidad y facilitan el uso de la columna en otras consultas."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q4": {
              "title": "Identificar usos válidos de multiplicación y división en SQL",
              "prompt": "¿Cuáles de las siguientes son formas válidas de usar la multiplicación y división en una sentencia SELECT de SQL? Elige todas las que correspondan.",
              "hint": "Considera tanto operaciones columna a columna como columna a constante.",
              "help": {
                "concept": "SQL permite operaciones aritméticas entre columnas, entre una columna y una constante, o entre constantes.",
                "hint_1": "Puedes multiplicar o dividir columnas, o usar constantes en expresiones.",
                "hint_2": "Busca opciones que usen sintaxis SQL válida para aritmética en SELECT."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q5": {
              "title": "Elegir el operador correcto para la división",
              "prompt": "Elige el mejor valor para el primer espacio en blanco que falta en la declaración.",
              "hint": "Piensa en el símbolo que se usa para la división en SQL.",
              "help": {
                "concept": "SQL utiliza símbolos aritméticos estándar para las operaciones, incluida la división.",
                "hint_1": "Es el mismo símbolo que en matemáticas básicas para la división.",
                "hint_2": "Busca el símbolo que separa el numerador y el denominador."
              },
              "template": "El primer valor que falta es [blank1].",
              "choices": [
                "/",
                "*",
                "+",
                "-"
              ]
            }
          }
        },
        "number-functions": {
          "label": "Funciones numéricas",
          "summary": "Funciones numéricas en columnas calculadas y expresiones SQL",
          "cards": {
            "sketch0": {
              "title": "¿Qué son las funciones numéricas en SQL?"
            },
            "sketch1": {
              "title": "Usar funciones aritméticas y numéricas juntas"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "q1-code-input": {
              "title": "Calcular y redondear el valor total del pedido",
              "prompt": "Escribe una consulta SQL para seleccionar el `id` y el valor total de cada pedido (cantidad multiplicada por unit_price), redondeado al número entero más cercano. Nombra la columna redondeada como `rounded_total`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT id, \n       -- tu código aquí\nFROM orders;"
            },
            "q2-code-input": {
              "title": "Encontrar el precio unitario mínimo",
              "prompt": "Escribe una consulta SQL para encontrar el precio unitario mínimo de la tabla `orders`. Nombra la columna de resultado como `min_price`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT -- tu código aquí\nFROM orders;"
            },
            "q3-single-choice": {
              "title": "¿Qué función SQL devuelve el valor absoluto de un número?",
              "prompt": "¿Cuál de las siguientes funciones SQL devuelve el valor absoluto de un número?",
              "hint": "Piensa en qué función elimina el signo de un número.",
              "help": {
                "concept": "La función ABS() devuelve el valor no negativo de un número, sin importar su signo original.",
                "hint_1": "Busca la función que siempre da un resultado positivo.",
                "hint_2": "Se usa comúnmente para convertir números negativos en positivos."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q4-multi-choice": {
              "title": "¿Cuáles de las siguientes son funciones numéricas en SQL?",
              "prompt": "Selecciona todas las opciones que sean funciones numéricas en SQL.",
              "hint": "Piensa en funciones que operan sobre datos numéricos.",
              "help": {
                "concept": "Las funciones numéricas realizan cálculos o transformaciones sobre valores numéricos, como redondear, encontrar mínimos o obtener valores absolutos.",
                "hint_1": "Considera funciones como ROUND, MIN y ABS.",
                "hint_2": "Excluye funciones que solo trabajan con texto o fechas."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q5-fill-blank-choice": {
              "title": "Completa el espacio en blanco: Redondear una columna calculada",
              "prompt": "Completa la expresión SQL para redondear el resultado de multiplicar cantidad por unit_price.",
              "hint": "Envuelve la multiplicación en una función de redondeo.",
              "help": {
                "concept": "Para redondear un valor calculado, usa la función ROUND() y coloca la expresión dentro de los paréntesis.",
                "hint_1": "La función debe verse como ROUND(expresión).",
                "hint_2": "La expresión dentro debe ser quantity * unit_price."
              },
              "template": "SELECT id, _____ AS rounded_total FROM orders;",
              "choices": [
                "ROUND(quantity * unit_price)",
                "MIN(quantity * unit_price)",
                "ABS(quantity * unit_price)",
                "SUM(quantity * unit_price)"
              ]
            }
          }
        },
        "renaming-outputs": {
          "label": "Renombrar salidas",
          "summary": "Renombrar salidas en columnas calculadas y expresiones SQL",
          "cards": {
            "sketch0": {
              "title": "¿Por qué renombrar salidas?"
            },
            "sketch1": {
              "title": "Sintaxis para alias"
            },
            "sketch2": {
              "title": "Ejemplo práctico"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "q1": {
              "title": "Renombrar una columna calculada",
              "prompt": "Escribe una consulta SQL para seleccionar `customer_name` y el valor total de cada pedido (cantidad multiplicada por unit_price) de la tabla `orders`. Nombra la columna calculada como `order_value`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta literal.",
                "hint_1": "Descarta opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT customer_name, \n       \nFROM orders;"
            },
            "q2": {
              "title": "Múltiples alias en una consulta",
              "prompt": "Escribe una consulta SQL para seleccionar `region` como `sales_region` y `status` como `order_status` de la tabla `orders`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta literal.",
                "hint_1": "Descarta opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT \nFROM orders;"
            },
            "q3": {
              "title": "Propósito de los alias",
              "prompt": "¿Por qué son útiles los alias (usando AS) en las consultas SQL?",
              "hint": "Piensa en cómo se ve la salida para alguien que lee los resultados.",
              "help": {
                "concept": "Los alias hacen que las columnas de resultados sean más fáciles de entender al darles nombres significativos.",
                "hint_1": "Considera cómo aparecen los nombres de las columnas en la tabla de salida.",
                "hint_2": "Los alias ayudan a que los informes o los datos exportados sean más legibles."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q4": {
              "title": "Usos válidos de los alias",
              "prompt": "¿Cuáles de los siguientes son usos válidos de alias en SQL? Selecciona todas las que correspondan.",
              "hint": "Piensa en dónde se pueden aplicar los alias en una sentencia SELECT.",
              "help": {
                "concept": "Los alias pueden usarse para renombrar columnas, expresiones e incluso tablas en algunos casos para mayor claridad.",
                "hint_1": "Considera tanto columnas calculadas como columnas normales.",
                "hint_2": "Puedes usar alias para expresiones y columnas en la lista SELECT."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q5": {
              "title": "Sintaxis de alias",
              "prompt": "Rellena el espacio en blanco para renombrar correctamente la columna `category` como `product_type` en una sentencia SELECT.",
              "hint": "Concéntrate en el concepto SQL que falta, no en la palabra exacta que falta.",
              "help": {
                "concept": "El espacio en blanco debe llenarse con el término SQL que corresponde a la función que la sentencia intenta realizar.",
                "hint_1": "Piensa en lo que se supone que debe hacer la parte faltante en la sentencia.",
                "hint_2": "Elige el término SQL que mejor complete el significado de la sentencia."
              },
              "template": "SELECT category ___ product_type FROM orders;",
              "choices": [
                "AS",
                "INTO",
                "=",
                "LIKE"
              ]
            }
          }
        },
        "renaming-result-columns": {
          "label": "Renombrar columnas de resultados",
          "summary": "Aprende cómo renombrar columnas en los resultados de consultas SQL usando alias de columna, haciendo que tu salida sea más legible y lista para presentaciones.",
          "cards": {
            "sketch0": {
              "title": "¿Qué es un alias de columna?"
            },
            "sketch1": {
              "title": "Sintaxis y uso de alias"
            },
            "sketch2": {
              "title": "Alias con expresiones y funciones"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "quiz-1-alias-calc-column": {
              "title": "Crear una columna calculada con un alias",
              "prompt": "Escribe una consulta SQL para seleccionar el `id` y una columna calculada para el valor total de cada pedido (cantidad multiplicada por precio_unitario), nombrando la nueva columna `order_total`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT id, \n       \nFROM orders;"
            },
            "quiz-2-alias-header": {
              "title": "Propósito de los alias de columna",
              "prompt": "¿Por qué son útiles los alias de columna en las consultas SQL?",
              "hint": "Piensa en cómo se ve la salida y cómo ayuda a los lectores.",
              "help": {
                "concept": "Los alias de columna hacen que los resultados de las consultas sean más fáciles de leer y entender al proporcionar encabezados claros y descriptivos.",
                "hint_1": "Los alias ayudan a que las columnas calculadas o complejas sean más comprensibles.",
                "hint_2": "Son especialmente útiles para informes y presentaciones."
              },
              "options": {
                "a": "Un comando",
                "b": "Un nombre de tabla"
              }
            },
            "quiz-3-multi-alias-usage": {
              "title": "¿Dónde puedes usar alias de columna?",
              "prompt": "¿En qué situaciones son útiles los alias de columna? Selecciona todas las que correspondan.",
              "hint": "Piensa en cuándo quieres que los resultados sean más claros o presentables.",
              "help": {
                "concept": "Los alias de columna son útiles para renombrar columnas en la salida, especialmente para columnas calculadas, funciones o al preparar datos para informes.",
                "hint_1": "Considera casos donde el nombre original de la columna no es claro o cuando usas expresiones.",
                "hint_2": "Los alias no se usan para cambiar el esquema real de la tabla."
              },
              "options": {
                "a": "Un comando",
                "b": "Un nombre de tabla"
              }
            },
            "quiz-4-alias-fill-blank": {
              "title": "Completa el espacio en blanco: Sintaxis de alias",
              "prompt": "Completa la instrucción SQL para renombrar la columna `region` como `area` en el conjunto de resultados.",
              "hint": "Concéntrate en el concepto SQL que falta, no en la palabra exacta.",
              "help": {
                "concept": "El espacio en blanco debe llenarse con el término SQL que corresponde a la acción que la instrucción intenta realizar.",
                "hint_1": "Piensa en lo que debe hacer la parte que falta en la instrucción.",
                "hint_2": "Elige el término SQL que mejor complete el significado de la instrucción."
              },
              "template": "SELECT region ___ area FROM orders;",
              "choices": [
                "AS",
                "=",
                "INTO",
                "TO"
              ]
            },
            "quiz-5-alias-multiple-columns": {
              "title": "Usar alias para varias columnas",
              "prompt": "Escribe una consulta SQL para seleccionar `customer_name` como `buyer`, `category` como `item_type` y `status` como `order_status` de la tabla `orders`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT \nFROM orders;"
            }
          }
        },
        "simple-report-queries": {
          "label": "Consultas simples de informes",
          "summary": "Aprende a escribir consultas SQL simples para informes usando columnas calculadas y expresiones, incluyendo el uso de alias para mayor claridad y aritmética básica en sentencias SELECT.",
          "cards": {
            "sketch0": {
              "title": "¿Qué es una columna calculada?"
            },
            "sketch1": {
              "title": "Uso de alias para mayor claridad"
            },
            "sketch2": {
              "title": "Expresiones en SELECT"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "q1": {
              "title": "Calcular totales de línea para cada pedido",
              "prompt": "Escribe una consulta SQL para mostrar el `id`, `customer_name` de cada pedido y una columna calculada llamada `line_total` que multiplique `quantity` por `unit_price` de la tabla `orders`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que el ejercicio te pide hacer."
              },
              "starterCode": "-- Escribe tu consulta aquí"
            },
            "q2": {
              "title": "Mostrar precio con descuento para cada pedido",
              "prompt": "Escribe una consulta SQL para mostrar `id`, `unit_price` y una nueva columna llamada `discounted_price` que muestre el precio unitario con un 15% de descuento (es decir, unit_price * 0.85) para cada pedido en la tabla `orders`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que el ejercicio te pide hacer."
              },
              "starterCode": "-- Escribe tu consulta aquí"
            },
            "q3": {
              "title": "Propósito de los alias en informes SQL",
              "prompt": "¿Por qué son útiles los alias (usando AS) al escribir consultas SQL para informes?",
              "hint": "Piensa en cómo se ve la salida para alguien que lee el informe.",
              "help": {
                "concept": "Los alias hacen que las columnas de resultados sean más fáciles de entender al darles nombres claros y descriptivos.",
                "hint_1": "Los alias ayudan a que los nombres de las columnas sean más legibles en la salida.",
                "hint_2": "Los alias son especialmente útiles cuando se usan expresiones o columnas calculadas."
              },
              "options": {
                "a": "a. Permiten ocultar columnas de la salida.",
                "b": "b. Hacen que los nombres de las columnas en el resultado sean más claros y legibles.",
                "c": "c. Aceleran la ejecución de la consulta.",
                "d": "d. Son obligatorios para cada columna."
              }
            },
            "q4": {
              "title": "¿Cuáles de las siguientes son expresiones SQL válidas para columnas calculadas?",
              "prompt": "Selecciona todas las opciones que muestran formas válidas de crear columnas calculadas en una sentencia SELECT.",
              "hint": "Busca expresiones que usen aritmética o combinen columnas.",
              "help": {
                "concept": "Una columna calculada puede usar operaciones aritméticas o funciones sobre columnas existentes en la cláusula SELECT.",
                "hint_1": "Verifica el uso correcto de la aritmética y los nombres de las columnas.",
                "hint_2": "Las expresiones válidas usan columnas existentes y aritmética o funciones, y pueden tener alias."
              },
              "options": {
                "a": "a. quantity * unit_price AS total",
                "b": "b. unit_price + 10 AS increased_price",
                "c": "c. SELECT * FROM orders",
                "d": "d. quantity / 2 AS half_quantity"
              }
            },
            "q5": {
              "title": "Completa el espacio en blanco: Sintaxis de columna calculada",
              "prompt": "Completa la sentencia SQL para crear una columna calculada que muestre el doble de la cantidad como `double_quantity`:\n\nSELECT id, quantity, ______ AS double_quantity FROM orders;",
              "hint": "Multiplica la columna quantity por 2.",
              "help": {
                "concept": "Para crear una columna calculada, usa aritmética sobre una columna existente y asígnale un alias con AS.",
                "hint_1": "El espacio en blanco debe ser una expresión que duplique la cantidad.",
                "hint_2": "Usa el término que falta en el espacio en blanco."
              },
              "template": "SELECT id, quantity, {{blank}} AS double_quantity FROM orders;",
              "choices": [
                "quantity * 2",
                "quantity + 2",
                "2 * quantity",
                "quantity / 2"
              ]
            }
          }
        },
        "string-functions": {
          "label": "Funciones de cadena",
          "summary": "Funciones de cadena en Columnas Calculadas y Expresiones SQL",
          "cards": {
            "sketch0": {
              "title": "¿Qué son las funciones de cadena en SQL?"
            },
            "sketch1": {
              "title": "Usando funciones de cadena en SELECT"
            },
            "sketch2": {
              "title": "Combinando funciones de cadena y alias"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "code-1": {
              "title": "Mostrar nombres de clientes en mayúsculas",
              "prompt": "Escribe una consulta SQL para mostrar el nombre de cada cliente en mayúsculas junto con su nombre original de la tabla `orders`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que el ejercicio te pide hacer."
              },
              "starterCode": "SELECT customer_name, \n       -- tu código aquí\nFROM orders;"
            },
            "code-2": {
              "title": "Extraer código de región",
              "prompt": "Escribe una consulta SQL para mostrar cada región y las dos primeras letras de la región en minúsculas, etiquetadas como `region_code`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que el ejercicio te pide hacer."
              },
              "starterCode": "SELECT region, \n       -- tu código aquí\nFROM orders;"
            },
            "single-1": {
              "title": "Propósito de la función LENGTH()",
              "prompt": "¿Qué devuelve la función LENGTH() cuando se usa en una columna de texto en SQL?",
              "hint": "Cuenta algo sobre el texto.",
              "help": {
                "concept": "LENGTH() devuelve el número de caracteres en una cadena, no palabras ni filas.",
                "hint_1": "Piensa en cuántas letras o símbolos hay en el texto.",
                "hint_2": "LENGTH() se refiere al tamaño del valor de texto, no de la tabla."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "multi-1": {
              "title": "¿Cuáles son funciones de cadena válidas en SQLite?",
              "prompt": "Selecciona todas las funciones a continuación que sean funciones de cadena válidas en SQLite.",
              "hint": "Algunas funciones cambian el caso, otras extraen partes del texto.",
              "help": {
                "concept": "Las funciones de cadena operan sobre valores de texto. SUM() es una función numérica agregada, no una función de cadena.",
                "hint_1": "Busca funciones que trabajen con texto, no con números.",
                "hint_2": "UPPER, LOWER, SUBSTR y LENGTH son todas para cadenas."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "fill-1": {
              "title": "Función para extraer parte de una cadena",
              "prompt": "¿Qué función extrae una subcadena de un valor de texto en SQLite?",
              "hint": "Concéntrate en el concepto SQL que falta en lugar de la palabra exacta que falta.",
              "help": {
                "concept": "El espacio en blanco debe llenarse con el término SQL que coincida con la tarea que la declaración intenta realizar.",
                "hint_1": "Piensa en lo que se supone que debe hacer la parte que falta en la declaración.",
                "hint_2": "Elige el término SQL que mejor complete el significado de la declaración."
              },
              "template": "Para obtener las tres primeras letras de una región, usa ____ (region, 1, 3).",
              "choices": [
                "SUBSTR",
                "LENGTH",
                "UPPER",
                "SUM"
              ]
            }
          }
        },
        "total-price-calculations": {
          "label": "Cálculos de precio total",
          "summary": "Aprende a calcular precios totales usando expresiones aritméticas y alias en SQL, con práctica práctica utilizando la tabla 'orders' del conjunto de datos sales_kpi.",
          "cards": {
            "sketch0": {
              "title": "¿Qué son las columnas calculadas?"
            },
            "sketch1": {
              "title": "¿Por qué usar alias?"
            },
            "sketch2": {
              "title": "Cómo manejar NULL en expresiones"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "q1-calc-total-price": {
              "title": "Calcular el precio total para cada pedido",
              "prompt": "Escribe una consulta SQL para seleccionar el `id`, `quantity`, `unit_price` y una columna calculada llamada `total_price` (que es `quantity * unit_price`) de la tabla `orders`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el papel o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Descarta opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT id, quantity, unit_price\nFROM orders;"
            },
            "q2-discounted-price": {
              "title": "Calcular el precio total con descuento",
              "prompt": "Escribe una consulta SQL para seleccionar `customer_name`, `quantity`, `unit_price` y una columna calculada llamada `discounted_total` que multiplica `quantity * unit_price * 0.9` (aplicando un 10% de descuento) de la tabla `orders`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el papel o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Descarta opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT customer_name, quantity, unit_price\nFROM orders;"
            },
            "q3-alias-purpose": {
              "title": "Propósito de usar alias",
              "prompt": "¿Por qué deberías usar un alias (AS) al crear columnas calculadas en SQL?",
              "hint": "Piensa en cómo se ve la salida.",
              "help": {
                "concept": "Los alias hacen que las columnas de resultados sean más fáciles de leer y entender, especialmente para expresiones.",
                "hint_1": "Sin alias, los nombres de las columnas pueden ser confusos o difíciles de leer.",
                "hint_2": "Los alias ayudan a que los informes y consultas sean más claros para los usuarios."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q4-multi-choice-expressions": {
              "title": "Identificando expresiones SQL válidas",
              "prompt": "¿Cuáles de las siguientes son expresiones SQL válidas para crear una columna calculada en la tabla `orders`? Selecciona todas las que correspondan.",
              "hint": "Busca expresiones que usen columnas existentes y sintaxis SQL válida.",
              "help": {
                "concept": "Una expresión SQL válida puede usar aritmética, funciones o combinar columnas en SELECT.",
                "hint_1": "Verifica si la expresión usa columnas de la tabla y operadores válidos.",
                "hint_2": "Las expresiones pueden involucrar aritmética o funciones, pero deben usar nombres de columna correctos."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q5-fill-blank-alias": {
              "title": "Rellenando el alias",
              "prompt": "Elige el mejor valor para el primer espacio en blanco que falta en la declaración.",
              "hint": "Concéntrate en el concepto SQL que falta más que en la palabra exacta que falta.",
              "help": {
                "concept": "El espacio en blanco debe llenarse con el término SQL que coincida con la función que la declaración intenta realizar.",
                "hint_1": "Piensa en lo que se supone que debe hacer la parte que falta en la declaración.",
                "hint_2": "Elige el término SQL que mejor complete el significado de la declaración."
              },
              "template": "El primer valor que falta es [blank1].",
              "choices": [
                "AS",
                "BY",
                "IN",
                "ON"
              ]
            }
          }
        },
        "what-aliases-are": {
          "label": "Qué son los alias",
          "summary": "Qué son los alias en columnas calculadas y expresiones SQL",
          "cards": {
            "sketch0": {
              "title": "Introducción a los alias en SQL"
            },
            "sketch1": {
              "title": "¿Por qué usar alias?"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "q1": {
              "title": "Crear una columna calculada con un alias",
              "prompt": "Escribe una consulta SQL para seleccionar el `customer_name` y el valor total de cada pedido (cantidad multiplicada por unit_price) de la tabla `orders`. Nombra la columna calculada como `order_value` usando un alias.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT customer_name, \n       quantity * unit_price AS order_value\nFROM orders;"
            },
            "q2": {
              "title": "Alias para una columna simple",
              "prompt": "Escribe una consulta SQL para seleccionar la columna `region` de la tabla `orders`, pero que se muestre como `area` en el resultado usando un alias.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT region AS area\nFROM orders;"
            },
            "q3": {
              "title": "Propósito de los alias de columna",
              "prompt": "¿Por qué usarías un alias de columna en una consulta SQL?",
              "hint": "Piensa en cómo se ven los resultados para quien los lee.",
              "help": {
                "concept": "Los alias de columna hacen que los resultados sean más fáciles de leer y entender al dar nombres significativos a las columnas.",
                "hint_1": "Los alias ayudan a aclarar qué representa una columna.",
                "hint_2": "Son especialmente útiles para columnas calculadas o cuando los nombres predeterminados no son claros."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q4": {
              "title": "Usos válidos de los alias",
              "prompt": "¿Cuáles de los siguientes son usos válidos de alias de columna en SQL? Selecciona todas las que correspondan.",
              "hint": "Piensa tanto en columnas calculadas como en columnas regulares.",
              "help": {
                "concept": "Los alias pueden usarse tanto para columnas calculadas como para renombrar columnas existentes y dar claridad al resultado.",
                "hint_1": "Puedes usar alias para expresiones y para columnas regulares.",
                "hint_2": "Si quieres renombrar una columna o una expresión en tu resultado SELECT, puedes usar un alias."
              },
              "options": {
                "a": "[object Object]",
                "b": "Un comando"
              }
            },
            "q5": {
              "title": "Sintaxis para alias de columna",
              "prompt": "Rellena el espacio en blanco para asignar correctamente un alias a una columna calculada en SQL.",
              "hint": "Concéntrate en el concepto SQL que falta, no en la palabra exacta.",
              "help": {
                "concept": "El espacio en blanco debe llenarse con el término SQL que corresponde a la función que realiza la instrucción.",
                "hint_1": "Piensa en lo que debe hacer la parte que falta en la instrucción.",
                "hint_2": "Elige el término SQL que mejor complete el significado de la instrucción."
              },
              "template": "SELECT quantity * unit_price ___ total_price FROM orders;",
              "choices": [
                "AS",
                "WITH",
                "INTO",
                "ON"
              ]
            }
          }
        },
        "what-expressions-are": {
          "label": "Qué son las expresiones",
          "summary": "Comprende qué son las expresiones en SQL, cómo se usan para crear nuevos valores en las consultas y por qué son esenciales para las columnas calculadas.",
          "cards": {
            "sketch0": {
              "title": "¿Qué es una expresión en SQL?"
            },
            "sketch1": {
              "title": "Expresiones con funciones y alias"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "code-1": {
              "title": "Calcular una nueva columna usando una expresión",
              "prompt": "Escribe una consulta SQL para seleccionar `id`, `quantity`, `unit_price` y una nueva columna llamada `line_total` que multiplique `quantity` por `unit_price` de la tabla `orders`.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Descarta opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT id, quantity, unit_price\n-- Agrega tu expresión aquí\nFROM orders;"
            },
            "code-2": {
              "title": "Usar una expresión con una función",
              "prompt": "Escribe una consulta SQL para seleccionar `id` y una nueva columna llamada `double_quantity` que sea el doble del valor de `quantity` para cada pedido.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Descarta opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "SELECT id,\n-- Tu expresión aquí\nFROM orders;"
            },
            "single-1": {
              "title": "Identificando una expresión",
              "prompt": "¿Cuál de los siguientes es un ejemplo de una expresión en SQL?",
              "hint": "Busca un cálculo o transformación usando columnas o valores.",
              "help": {
                "concept": "Una expresión es cualquier combinación válida de columnas, valores, operadores o funciones que devuelve un solo valor.",
                "hint_1": "Las expresiones suelen usar aritmética o funciones.",
                "hint_2": "Multiplicar dos columnas es un ejemplo clásico de una expresión."
              },
              "options": {
                "a": "a. SELECT * FROM orders;",
                "b": "b. quantity * unit_price",
                "c": "c. FROM orders",
                "d": "d. AS line_total"
              }
            },
            "multi-1": {
              "title": "¿Cuáles de las siguientes son expresiones SQL válidas?",
              "prompt": "Selecciona todas las opciones que sean expresiones SQL válidas.",
              "hint": "Las expresiones pueden ser aritméticas, funciones o referencias directas a columnas.",
              "help": {
                "concept": "Las expresiones válidas incluyen operaciones aritméticas, llamadas a funciones e incluso referencias a una sola columna.",
                "hint_1": "Piensa en lo que puede aparecer en una cláusula SELECT para producir un valor.",
                "hint_2": "Tanto los cálculos como las llamadas a funciones son expresiones válidas."
              },
              "options": {
                "a": "a. quantity + 10",
                "b": "b. ROUND(unit_price, 1)",
                "c": "c. orders",
                "d": "d. status"
              }
            },
            "fill-1": {
              "title": "Completa el espacio: Resultado de la expresión",
              "prompt": "En SQL, una expresión siempre produce un ______.",
              "hint": "¿Qué devuelve una expresión?",
              "help": {
                "concept": "Una expresión en SQL siempre evalúa el término que falta.",
                "hint_1": "Piensa en el resultado de un cálculo o función.",
                "hint_2": "No es una tabla ni un nombre de columna, sino un solo resultado."
              },
              "template": "En SQL, una expresión siempre produce un {blank}.",
              "choices": [
                "tabla",
                "valor único",
                "nombre de columna",
                "fila"
              ]
            }
          }
        },
        "writing-readable-output": {
          "label": "Escribir salidas legibles",
          "summary": "Aprende cómo usar alias de columnas y expresiones en SQL para que los resultados de tus consultas sean claros y listos para presentar.",
          "cards": {
            "sketch0": {
              "title": "Por qué importa una salida legible"
            },
            "sketch1": {
              "title": "Usar alias de columna en SELECT"
            },
            "sketch2": {
              "title": "Preparar informes para presentación"
            },
            "quiz": {
              "title": "Cuestionario"
            }
          },
          "quiz": {
            "q1": {
              "title": "Calcular y etiquetar una nueva columna",
              "prompt": "Escribe una consulta SQL para mostrar el `id` de cada pedido, el `customer_name` y el valor total del pedido como `line_total` (calculado como `quantity * unit_price`).",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "-- Escribe tu consulta aquí"
            },
            "q2": {
              "title": "Formatear la salida con nombres de columna legibles",
              "prompt": "Escribe una consulta SQL para mostrar `customer_name` como \"Customer Name\" y `region` como \"Region\" para todos los pedidos.",
              "hint": "Concéntrate en el concepto que se está evaluando.",
              "help": {
                "concept": "Piensa en el rol o la idea que se está evaluando en lugar de repetir la respuesta.",
                "hint_1": "Elimina opciones o interpretaciones que no coincidan con la tarea.",
                "hint_2": "Elige el concepto que mejor se ajuste a lo que te pide el ejercicio."
              },
              "starterCode": "-- Escribe tu consulta aquí"
            },
            "q3": {
              "title": "Propósito de los alias de columna",
              "prompt": "¿Por qué deberías usar alias de columna en tus consultas SQL?",
              "hint": "Piensa en cómo se ve la salida para alguien que lee los resultados.",
              "help": {
                "concept": "Los alias de columna se usan para mejorar la legibilidad de los resultados de tus consultas.",
                "hint_1": "Los alias afectan cómo se etiquetan las columnas en el resultado, no el rendimiento ni los tipos de datos.",
                "hint_2": "Ayudan a otros a entender qué representa cada columna."
              },
              "options": {
                "a": "Un comando",
                "b": "Un nombre de tabla"
              }
            },
            "q4": {
              "title": "Identificar usos válidos de alias",
              "prompt": "¿Cuáles de las siguientes son razones válidas para usar alias de columna? (Elige todas las que correspondan)",
              "hint": "Considera cómo los alias afectan la salida y la comprensión de los resultados.",
              "help": {
                "concept": "Los alias ayudan a clarificar, formatear y desambiguar columnas en los conjuntos de resultados.",
                "hint_1": "No se usan para filtrar, sino para etiquetar y dar claridad.",
                "hint_2": "Piensa en columnas calculadas, funciones y en hacer los informes legibles."
              },
              "options": {
                "a": "Un comando",
                "b": "Un nombre de tabla"
              }
            },
            "q5": {
              "title": "Sintaxis para asignar un alias",
              "prompt": "Elige el mejor valor para el primer espacio en blanco que falta en la declaración.",
              "hint": "Concéntrate en el concepto SQL que falta, no en la palabra exacta.",
              "help": {
                "concept": "El espacio en blanco debe llenarse con el término SQL que coincida con la función que la declaración intenta realizar.",
                "hint_1": "Piensa en lo que se supone que debe hacer la parte que falta en la declaración.",
                "hint_2": "Elige el término SQL que mejor complete el significado de la declaración."
              },
              "template": "El primer valor que falta es [blank1].",
              "choices": [
                "AS",
                "BY",
                "WITH",
                "ON"
              ]
            }
          }
        }
      }
    }
  },
  "sketches": {
    "sql": {
      "sql_module_5": {
        "adding-and-subtracting": {
          "sketch-1": {
            "title": "¿Qué son las columnas calculadas?",
            "bodyMarkdown": "Una columna calculada en SQL es un valor que creas al vuelo en tu sentencia SELECT usando aritmética o expresiones. Por ejemplo, puedes multiplicar las columnas `quantity` y `unit_price` para obtener un total por cada pedido:\n\n```sql\nSELECT id, customer_name, quantity, unit_price, quantity * unit_price AS line_total\nFROM orders;\n```\n\nEsta consulta agrega una nueva columna llamada `line_total` que no está almacenada en la tabla, sino que se calcula para cada fila."
          },
          "sketch-2": {
            "title": "Sumar y restar en SELECT",
            "bodyMarkdown": "Puedes usar `+` para sumar y `-` para restar columnas o valores en SQL. Por ejemplo, para dar un descuento de $5 en cada pedido, resta 5 al total calculado:\n\n```sql\nSELECT id, customer_name, quantity, unit_price, (quantity * unit_price) - 5 AS discounted_total\nFROM orders;\n```\n\nTambién puedes sumar una tarifa fija, como un cargo de envío de $2:\n\n```sql\nSELECT id, customer_name, (quantity * unit_price) + 2 AS total_with_shipping\nFROM orders;\n```"
          },
          "sketch-3": {
            "title": "Usar alias para mayor claridad",
            "bodyMarkdown": "Cuando creas una columna calculada, usa `AS` para darle un nombre claro (alias). Esto hace que tus resultados sean más fáciles de leer y entender. Por ejemplo:\n\n```sql\nSELECT id, customer_name, quantity * unit_price AS line_total\nFROM orders;\n```\n\nAquí, `line_total` es el alias para el valor calculado."
          }
        },
        "as": {
          "sk1": {
            "title": "¿Qué es AS en SQL?",
            "bodyMarkdown": "En SQL, la palabra clave `AS` se utiliza para asignar un alias a una columna o tabla. Esto es especialmente útil cuando quieres renombrar una columna en tu conjunto de resultados, haciéndolo más fácil de leer o más significativo. Por ejemplo, si calculas un valor en tu sentencia SELECT, puedes usar `AS` para darle a esa columna calculada un nombre claro.\n\nEjemplo:\n```sql\nSELECT quantity * unit_price AS line_total\nFROM orders;\n```\nEsta consulta calcula el total para cada línea de pedido y etiqueta el resultado como `line_total` en lugar de la expresión por defecto."
          },
          "sk2": {
            "title": "¿Por qué usar alias de columna?",
            "bodyMarkdown": "Los alias de columna hacen que los resultados de tus consultas SQL sean más legibles y listos para presentación. Sin un alias, las columnas calculadas o los resultados de funciones pueden tener nombres poco claros o complejos. Usar `AS` ayuda a clarificar el significado de cada columna en tu salida.\n\nEjemplo:\n```sql\nSELECT customer_name, quantity * unit_price AS total_amount\nFROM orders;\n```\nAquí, `total_amount` es mucho más claro que solo ver el cálculo."
          },
          "sk3": {
            "title": "Alias con funciones y expresiones",
            "bodyMarkdown": "Puedes usar `AS` con cualquier expresión o función en tu sentencia SELECT. Esto incluye operaciones aritméticas, de cadenas o funciones integradas.\n\nEjemplo:\n```sql\nSELECT customer_name, UPPER(region) AS region_upper\nFROM orders;\n```\nEsta consulta muestra el nombre de cada cliente y su región en mayúsculas, etiquetada como `region_upper`."
          }
        },
        "date-function-awareness": {
          "sk1": {
            "title": "¿Qué son las funciones de fecha en SQL?",
            "bodyMarkdown": "Las funciones de fecha en SQL te permiten manipular y extraer información de valores de fecha. Por ejemplo, puedes extraer el año, mes o día de una fecha, o calcular la diferencia entre dos fechas. En SQLite, las funciones de fecha comunes incluyen `date()`, `strftime()` y `datetime()`. Estas son útiles para filtrar, agrupar o crear nuevas columnas basadas en información de fecha.\n\n**Ejemplo:**\n\n```sql\nSELECT customer_name, quantity, unit_price, quantity * unit_price AS calculated_value\nFROM orders;\n```\n\nEsta consulta extrae el año de cada `order_date` en la tabla `orders`."
          },
          "sk2": {
            "title": "Uso de funciones de fecha en columnas calculadas",
            "bodyMarkdown": "Puedes usar funciones de fecha directamente en tus sentencias SELECT para crear columnas calculadas. Por ejemplo, si quieres ver en qué mes se realizó cada pedido, puedes usar:\n\n```sql\nSELECT customer_name, quantity, unit_price, quantity * unit_price AS calculated_value\nFROM orders;\n```\n\nEsto agregará una nueva columna llamada `order_month` mostrando la parte del mes de la fecha de cada pedido."
          },
          "sk3": {
            "title": "Filtrado con funciones de fecha",
            "bodyMarkdown": "Las funciones de fecha también son útiles para filtrar datos. Por ejemplo, para encontrar todos los pedidos realizados en enero, puedes usar:\n\n```sql\nSELECT customer_name, quantity, unit_price, quantity * unit_price AS calculated_value\nFROM orders;\n```\n\nEsto filtra la tabla `orders` para incluir solo las filas donde el mes es enero."
          }
        },
        "discount-calculations": {
          "sk1": {
            "title": "¿Qué son los cálculos de descuentos en SQL?",
            "bodyMarkdown": "Los cálculos de descuentos en SQL implican usar expresiones aritméticas para calcular nuevos valores basados en columnas existentes. Por ejemplo, puedes calcular un precio con descuento multiplicando el precio original por una tasa de descuento. Estos cálculos suelen realizarse en la cláusula `SELECT` y pueden recibir nombres legibles usando alias.\n\nEjemplo:\n\n```sql\nSELECT id, customer_name, unit_price, unit_price * 0.9 AS discounted_price\nFROM orders;\n```\n\nEsta consulta muestra el precio original de cada pedido y el precio tras un 10% de descuento."
          },
          "sk2": {
            "title": "Uso de múltiples columnas en expresiones",
            "bodyMarkdown": "Puedes combinar columnas en expresiones SQL para calcular valores como totales de línea o aplicar descuentos a los totales. Por ejemplo, para obtener el precio total de cada línea de pedido tras un 15% de descuento:\n\n```sql\nSELECT id, quantity, unit_price, quantity * unit_price AS line_total,\n       quantity * unit_price * 0.85 AS discounted_total\nFROM orders;\n```\n\nEsto multiplica la cantidad por el precio unitario para el total original y luego aplica un 15% de descuento."
          }
        },
        "intro-to-functions": {
          "sk1": {
            "title": "¿Qué es una función SQL?",
            "bodyMarkdown": "Una función SQL es una operación incorporada que toma uno o más valores como entrada y devuelve un solo valor como salida. Las funciones pueden usarse en sentencias SELECT para transformar o resumir datos. Por ejemplo, puedes usar `UPPER(customer_name)` para convertir todos los nombres de clientes a mayúsculas, o `ROUND(unit_price, 0)` para redondear precios al entero más cercano."
          },
          "sk2": {
            "title": "Usando funciones en SELECT",
            "bodyMarkdown": "Puedes usar funciones directamente en tu cláusula SELECT. Por ejemplo, para mostrar el id del pedido y el nombre del cliente en mayúsculas de la tabla `orders`:\n\n```sql\nSELECT id, UPPER(customer_name) AS customer_upper FROM orders;\n```\nEsta consulta devuelve el id de cada pedido y el nombre del cliente en mayúsculas."
          },
          "sk3": {
            "title": "Combinando funciones con expresiones",
            "bodyMarkdown": "Las funciones pueden combinarse con expresiones aritméticas. Por ejemplo, para calcular el precio total de cada pedido y redondearlo al número entero más cercano:\n\n```sql\nSELECT id, ROUND(quantity * unit_price, 0) AS rounded_total FROM orders;\n```\nEsto multiplica `quantity` por `unit_price` para cada pedido y luego redondea el resultado."
          }
        },
        "math-in-sql": {
          "sketch-1": {
            "title": "Uso de operaciones aritméticas en SQL SELECT",
            "bodyMarkdown": "SQL te permite realizar operaciones aritméticas directamente en tus sentencias SELECT. Por ejemplo, puedes multiplicar columnas para calcular totales. En la tabla `orders`, para obtener el valor total de cada pedido, puedes multiplicar `quantity` por `unit_price`:\n\n```sql\nSELECT id, quantity, unit_price, quantity * unit_price AS line_total\nFROM orders;\n```\n\nEsto crea una nueva columna llamada `line_total` en el conjunto de resultados."
          },
          "sketch-2": {
            "title": "Renombrar columnas calculadas con alias",
            "bodyMarkdown": "Cuando creas nuevos valores en consultas SQL, puedes usar la palabra clave `AS` para darles un nombre claro (alias). Esto hace que tus resultados sean más fáciles de leer. Por ejemplo:\n\n```sql\nSELECT customer_name, quantity * unit_price AS total_amount\nFROM orders;\n```\n\nAquí, `total_amount` es un alias para el valor calculado."
          },
          "sketch-3": {
            "title": "Expresiones y valores NULL",
            "bodyMarkdown": "Si cualquier valor en una expresión aritmética es `NULL`, el resultado también será `NULL`. Por ejemplo, si `quantity` es `NULL` para una fila, `quantity * unit_price` devolverá `NULL` para esa fila. Siempre revisa tus datos en busca de valores faltantes si ves `NULL`s inesperados en tus resultados."
          }
        },
        "multiplying-and-dividing": {
          "sk1": {
            "title": "Multiplicar columnas en SQL",
            "bodyMarkdown": "En SQL, puedes multiplicar dos columnas para crear un nuevo valor calculado en tu sentencia SELECT. Por ejemplo, para calcular el valor total de cada pedido en la tabla `orders`, puedes multiplicar `quantity` por `unit_price`:\n\n```sql\nSELECT id, quantity, unit_price, quantity * unit_price AS line_total\nFROM orders;\n```\n\nEsta consulta agrega una nueva columna llamada `line_total` que muestra el resultado de la multiplicación para cada fila."
          },
          "sk2": {
            "title": "Dividir columnas en SQL",
            "bodyMarkdown": "La división también puede usarse en expresiones SQL. Por ejemplo, si quieres saber el precio promedio por artículo para cada pedido, puedes dividir el valor total por la cantidad:\n\n```sql\nSELECT id, quantity, unit_price, (quantity * unit_price) / quantity AS avg_price\nFROM orders;\n```\n\nEsto devolverá el precio promedio por artículo para cada pedido. Ten cuidado de no dividir por cero."
          },
          "sk3": {
            "title": "Uso de alias para mayor legibilidad",
            "bodyMarkdown": "Cuando usas aritmética en SQL, es útil usar la palabra clave `AS` para dar nombres claros (alias) a tus columnas calculadas. Esto hace que tus resultados sean más fáciles de leer y entender. Por ejemplo:\n\n```sql\nSELECT customer_name, quantity * unit_price AS total_amount\nFROM orders;\n```\n\nAquí, `total_amount` es un alias para el valor calculado."
          }
        },
        "number-functions": {
          "sketch-1": {
            "title": "¿Qué son las funciones numéricas en SQL?",
            "bodyMarkdown": "Las funciones numéricas en SQL son funciones integradas que realizan operaciones sobre datos numéricos. Se pueden usar para redondear números, encontrar valores mínimos o máximos, calcular promedios y más. Por ejemplo, puedes usar `ROUND()` para redondear un valor, o `ABS()` para obtener el valor absoluto de un número. Estas funciones se usan a menudo en sentencias SELECT para transformar o resumir datos.\n\nEjemplo:\n\n```sql\nSELECT id, unit_price, ROUND(unit_price) AS rounded_price\nFROM orders;\n```\n\nEsta consulta selecciona el id del pedido, el precio unitario original y el precio unitario redondeado para cada pedido."
          },
          "sketch-2": {
            "title": "Usar operaciones aritméticas y funciones numéricas juntas",
            "bodyMarkdown": "Puedes combinar operaciones aritméticas con funciones numéricas para crear columnas calculadas más complejas. Por ejemplo, podrías querer calcular el precio total de cada pedido y luego redondearlo al número entero más cercano.\n\nEjemplo:\n\n```sql\nSELECT id, quantity * unit_price AS total, ROUND(quantity * unit_price) AS rounded_total\nFROM orders;\n```\n\nEsta consulta multiplica `quantity` por `unit_price` para obtener el total, y luego usa `ROUND()` para redondear el resultado."
          }
        },
        "renaming-outputs": {
          "sk1": {
            "title": "¿Por qué renombrar salidas?",
            "bodyMarkdown": "Cuando usas expresiones o cálculos en una sentencia SELECT de SQL, las columnas de resultado a menudo tienen nombres genéricos o poco claros. Renombrar estas salidas con **alias** usando la palabra clave `AS` hace que tus resultados sean más fáciles de leer y entender. Por ejemplo:\n\n```sql\nSELECT customer_name, quantity * unit_price AS line_total\nFROM orders;\n```\n\nAquí, a `quantity * unit_price` se le da el alias `line_total`, haciendo que la columna de salida sea clara y significativa."
          },
          "sk2": {
            "title": "Sintaxis para alias",
            "bodyMarkdown": "Para renombrar una columna o expresión en SQL, usa la palabra clave `AS`:\n\n```sql\nSELECT column_or_expression AS alias_name\nFROM table_name;\n```\n\nTambién puedes usar alias sin `AS`, pero usar `AS` es más claro y legible. Por ejemplo:\n\n```sql\nSELECT region AS sales_region FROM orders;\n```"
          },
          "sk3": {
            "title": "Ejemplo práctico",
            "bodyMarkdown": "Supón que quieres mostrar el cliente de cada pedido, el precio total y el estado. Puedes escribir:\n\n```sql\nSELECT customer_name, quantity * unit_price AS total_price, status\nFROM orders;\n```\n\nEsta consulta calcula el precio total de cada pedido y etiqueta la columna como `total_price` para mayor claridad."
          }
        },
        "renaming-result-columns": {
          "sketch-1-alias-basics": {
            "title": "¿Qué es un alias de columna?",
            "bodyMarkdown": "Un alias de columna en SQL te permite renombrar la salida de una columna o expresión en tu conjunto de resultados. Esto es especialmente útil para columnas calculadas o cuando deseas encabezados más descriptivos en tus informes.\n\nPor ejemplo, si quieres mostrar el precio total de cada pedido en la tabla `orders`:\n\n```sql\nSELECT id, quantity * unit_price AS total_price\nFROM orders;\n```\n\nAquí, `total_price` es un alias para la expresión calculada `quantity * unit_price`."
          },
          "sketch-2-alias-syntax": {
            "title": "Sintaxis y uso de alias",
            "bodyMarkdown": "Para asignar un alias, usa la palabra clave `AS` después de la columna o expresión. El alias aparece como el encabezado de columna en tu resultado.\n\n```sql\nSELECT customer_name AS buyer, region AS sales_region\nFROM orders;\n```\n\nTambién puedes usar alias sin `AS`, pero usar `AS` mejora la legibilidad."
          },
          "sketch-3-alias-with-functions": {
            "title": "Alias con expresiones y funciones",
            "bodyMarkdown": "Los alias son especialmente útiles al usar expresiones o funciones. Por ejemplo, para mostrar el precio unitario promedio por pedido:\n\n```sql\nSELECT AVG(unit_price) AS avg_price\nFROM orders;\n```\n\nEsto hace que la columna de resultados sea clara y fácil de entender."
          }
        },
        "simple-report-queries": {
          "sk1": {
            "title": "¿Qué es una columna calculada?",
            "bodyMarkdown": "Una columna calculada en SQL es un valor que creas al vuelo en tu sentencia SELECT usando aritmética o expresiones. Por ejemplo, si quieres ver el valor total de cada pedido en la tabla `orders`, puedes multiplicar `quantity` por `unit_price`:\n\n```sql\nSELECT id, quantity * unit_price AS line_total\nFROM orders;\n```\nEsta consulta muestra el ID de cada pedido y su total de línea calculado."
          },
          "sk2": {
            "title": "Uso de alias para mayor claridad",
            "bodyMarkdown": "Los alias te permiten renombrar columnas en tu conjunto de resultados para una mejor legibilidad. Usa la palabra clave `AS` para darle un nuevo nombre a una columna. Por ejemplo:\n\n```sql\nSELECT customer_name AS buyer, region, quantity * unit_price AS total_amount\nFROM orders;\n```\nAquí, `customer_name` aparece como `buyer` y la columna calculada se etiqueta como `total_amount`."
          },
          "sk3": {
            "title": "Expresiones en SELECT",
            "bodyMarkdown": "Puedes usar expresiones aritméticas directamente en la cláusula SELECT. Por ejemplo, para mostrar un 10% de descuento en cada pedido:\n\n```sql\nSELECT id, unit_price, unit_price * 0.9 AS discounted_price\nFROM orders;\n```\nEsta consulta muestra los precios originales y con descuento para cada pedido."
          }
        },
        "string-functions": {
          "sketch-1": {
            "title": "¿Qué son las funciones de cadena en SQL?",
            "bodyMarkdown": "Las funciones de cadena en SQL te permiten manipular datos de texto en tus consultas. Las funciones de cadena más comunes incluyen `UPPER()`, `LOWER()`, `LENGTH()` y `SUBSTR()`. Estas funciones pueden ayudarte a limpiar, formatear o extraer información de columnas de texto. Por ejemplo, puedes usar `UPPER(customer_name)` para mostrar todos los nombres de clientes en mayúsculas."
          },
          "sketch-2": {
            "title": "Usando funciones de cadena en SELECT",
            "bodyMarkdown": "Puedes usar funciones de cadena directamente en la cláusula SELECT para crear columnas calculadas. Por ejemplo, para mostrar la longitud de cada nombre de cliente en la tabla `orders`:\n\n```sql\nSELECT customer_name, LENGTH(customer_name) AS name_length FROM orders;\n```\nEsto devolverá cada nombre de cliente junto con el número de caracteres en su nombre."
          },
          "sketch-3": {
            "title": "Combinando funciones de cadena y alias",
            "bodyMarkdown": "Las funciones de cadena a menudo se combinan con alias para que los resultados sean más fáciles de leer. Por ejemplo, para mostrar las tres primeras letras de cada región en mayúsculas:\n\n```sql\nSELECT region, UPPER(SUBSTR(region, 1, 3)) AS region_code FROM orders;\n```\nEsta consulta crea una nueva columna `region_code` mostrando las tres primeras letras de la región en mayúsculas."
          }
        },
        "total-price-calculations": {
          "sketch-1": {
            "title": "¿Qué son las columnas calculadas?",
            "bodyMarkdown": "Una columna calculada en SQL es un valor que creas al vuelo en tu sentencia SELECT, a menudo combinando o transformando columnas existentes. Por ejemplo, si quieres saber el precio total de cada pedido en la tabla `orders`, puedes multiplicar `quantity` por `unit_price`:\n\n```sql\nSELECT id, quantity, unit_price, quantity * unit_price AS total_price\nFROM orders;\n```\n\nAquí, `quantity * unit_price` es una expresión, y `AS total_price` le da un nombre claro en la salida."
          },
          "sketch-2": {
            "title": "¿Por qué usar alias?",
            "bodyMarkdown": "Los alias hacen que los resultados de tus consultas sean más fáciles de leer y entender. Cuando usas una expresión en SQL, el nombre de columna por defecto puede ser confuso (como `quantity * unit_price`). Al agregar `AS total_price`, le das a la columna un nombre significativo:\n\n```sql\nSELECT customer_name, quantity * unit_price AS total_price\nFROM orders;\n```\n\nEsto es especialmente útil al compartir resultados o crear informes."
          },
          "sketch-3": {
            "title": "Cómo manejar NULL en expresiones",
            "bodyMarkdown": "Si cualquier valor en una expresión aritmética es NULL, el resultado también será NULL. Por ejemplo, si `unit_price` es NULL para una fila, entonces `quantity * unit_price` devolverá NULL para esa fila. Siempre revisa tus datos y considera usar funciones como `COALESCE()` para manejar valores faltantes si es necesario."
          }
        },
        "what-aliases-are": {
          "sk1": {
            "title": "Introducción a los alias en SQL",
            "bodyMarkdown": "En SQL, un **alias** es un nombre temporal que se da a una columna o tabla durante la ejecución de una consulta. Los alias hacen que tus resultados sean más fáciles de leer y tus consultas más fáciles de escribir, especialmente cuando usas columnas calculadas o expresiones. Creas un alias usando la palabra clave `AS`.\n\nPor ejemplo, si quieres mostrar el valor total de cada pedido en la tabla `orders`, puedes multiplicar `quantity` por `unit_price` y darle al resultado un nombre claro:\n\n```sql\nSELECT id, customer_name, quantity * unit_price AS line_total\nFROM orders;\n```\n\nAquí, `line_total` es un alias para la columna calculada."
          },
          "sk2": {
            "title": "¿Por qué usar alias?",
            "bodyMarkdown": "Los alias ayudan a que los resultados de tus consultas SQL sean más comprensibles. Sin alias, las columnas calculadas o expresiones aparecerían con nombres genéricos o confusos. Por ejemplo, `quantity * unit_price` aparecería como una columna con ese nombre exacto, lo cual no es muy amigable para el usuario.\n\nAl usar un alias, puedes renombrar esta columna con algo significativo, como `line_total` o `total_price`, haciendo que tus reportes sean más claros para quien los lea."
          }
        },
        "what-expressions-are": {
          "sketch-1": {
            "title": "¿Qué es una expresión en SQL?",
            "bodyMarkdown": "Una **expresión** en SQL es cualquier combinación de valores, columnas, operadores y funciones que produce un solo valor. Las expresiones se usan a menudo en la cláusula `SELECT` para calcular nuevas columnas o transformar datos. Por ejemplo, puedes multiplicar dos columnas para obtener un nuevo valor:\n\n```sql\nSELECT id, quantity * unit_price AS line_total\nFROM orders;\n```\n\nAquí, `quantity * unit_price` es una expresión que calcula el precio total para cada línea de pedido."
          },
          "sketch-2": {
            "title": "Expresiones con funciones y alias",
            "bodyMarkdown": "Las expresiones también pueden usar funciones integradas de SQL. Por ejemplo, puedes redondear un valor calculado:\n\n```sql\nSELECT id, ROUND(quantity * unit_price, 2) AS rounded_total\nFROM orders;\n```\n\nLa función `ROUND()` se aplica a la expresión y el resultado recibe el alias `rounded_total` para mayor claridad."
          }
        },
        "writing-readable-output": {
          "sk1": {
            "title": "Por qué importa una salida legible",
            "bodyMarkdown": "Cuando escribes consultas SQL, los nombres de columna predeterminados en tus resultados suelen venir directamente de la tabla o de tus expresiones. Estos nombres pueden ser poco claros, especialmente cuando usas cálculos o funciones. Usar **alias de columna** ayuda a que tu salida sea más comprensible para cualquiera que lea tus informes."
          },
          "sk2": {
            "title": "Usar alias de columna en SELECT",
            "bodyMarkdown": "Puedes renombrar columnas en tu conjunto de resultados usando la palabra clave `AS`. Por ejemplo, para mostrar el valor total de cada pedido en la tabla `orders`:\n\n```sql\nSELECT id, quantity * unit_price AS line_total\nFROM orders;\n```\n\nAquí, `line_total` es un alias para la columna calculada."
          },
          "sk3": {
            "title": "Preparar informes para presentación",
            "bodyMarkdown": "Los nombres de columna legibles son especialmente importantes al compartir resultados con otros. Por ejemplo, puedes usar espacios en los alias envolviéndolos entre comillas dobles:\n\n```sql\nSELECT customer_name AS \"Customer Name\", region AS \"Region\"\nFROM orders;\n```\n\nEsto hace que tu salida se vea más como un informe terminado."
          }
        }
      }
    }
  },
  "subjects": {
    "sql": {
      "title": "SQL para principiantes",
      "description": "Aprende SQL desde cero con práctica práctica.",
      "moreComingSoon": "Pronto habrá más lecciones de SQL para principiantes."
    }
  },
  "modules": {
    "sql": {
      "sql_module_5": {
        "title": "Columnas calculadas y expresiones SQL",
        "description": "Enseña a los estudiantes a crear nuevos valores a partir de datos existentes para que las tablas en bruto se conviertan en informes útiles.",
        "outcomes": [
          "Usar aritmética y expresiones dentro de SELECT.",
          "Renombrar salidas con alias para mayor legibilidad.",
          "Aplicar funciones integradas simples de forma segura."
        ],
        "why": [
          "Genera confianza con columnas calculadas y expresiones SQL.",
          "Prepara a los estudiantes para las siguientes habilidades del curso."
        ]
      }
    }
  },
  "sections": {
    "sql": {
      "sql_module_5": {
        "section_5_1": {
          "title": "Creando nuevos valores en consultas",
          "description": "",
          "weeks": null,
          "bullets": [
            "Qué son las expresiones",
            "Matemáticas en SQL",
            "Sumar y restar",
            "Multiplicar y dividir"
          ]
        },
        "section_5_2": {
          "title": "Alias de columnas",
          "description": "",
          "weeks": null,
          "bullets": [
            "Qué son los alias",
            "AS",
            "Renombrar columnas de resultados",
            "Escribir salidas legibles"
          ]
        },
        "section_5_3": {
          "title": "Funciones simples",
          "description": "",
          "weeks": null,
          "bullets": [
            "Introducción a las funciones",
            "Funciones de cadenas",
            "Funciones numéricas",
            "Conocimiento de funciones de fecha"
          ]
        },
        "section_5_4": {
          "title": "Práctica de expresiones",
          "description": "",
          "weeks": null,
          "bullets": [
            "Cálculos de precio total",
            "Cálculos de descuento",
            "Renombrar salidas",
            "Consultas de informes simples"
          ]
        }
      }
    }
  }
};
export default messages;
