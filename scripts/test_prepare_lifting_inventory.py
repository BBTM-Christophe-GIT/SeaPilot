import importlib.util
import unittest
from datetime import datetime
from pathlib import Path

spec = importlib.util.spec_from_file_location('lifting_import', Path(__file__).with_name('prepare-lifting-inventory.py'))
register = importlib.util.module_from_spec(spec)
spec.loader.exec_module(register)


class LiftingImportTest(unittest.TestCase):
    def row(self, **overrides):
        values = {header: None for header in register.HEADERS}
        values.update({'ID': 1, 'Navire: Titre': 'TEST', 'Type de Matériel': 'Manille', 'Description': 'Test', 'CMU en T': 2})
        values.update(overrides)
        return values

    def test_dates_false_checks_and_scrapping_remain_source_metadata(self):
        row = self.row(**{'Date dernière visite': datetime(2025, 11, 26), 'EG': False, 'N ID': True,
                         'Périodicité de visite': 'Biannuelle', 'Action': 'Mise au Rebus'})
        result = register.prepare_rows([(2, row)], 'register.xlsx', 'hash')[0]
        self.assertFalse(result['active'])
        self.assertEqual(result['source_data']['last_inspected_on'], '2025-11-26')
        self.assertEqual(result['source_data']['historical_checks']['EG'], False)
        self.assertEqual(result['source_data']['inspection_frequency'], 'Biannuelle')
        self.assertIsNone(result['source_data']['valid_until'])
        self.assertNotIn('condition', result)

    def test_duplicates_and_invalid_identifiers_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            register.prepare_rows([(2, self.row()), (3, self.row())], 'register.xlsx', 'hash')
        for value in [None, 'not-an-id', True, 1.5, -1]:
            with self.assertRaisesRegex(ValueError, 'invalid source ID'):
                register.prepare_rows([(2, self.row(ID=value))], 'register.xlsx', 'hash')

    def test_classification_distinguishes_chain_slings_and_maritime_towing(self):
        self.assertEqual(register.classify('Elingue', 'ÉLINGUE CHAÎNE 4 BRINS'), ('lifting', 'Chaînes', None))
        self.assertEqual(register.classify('Remorque', "PATTE D'OIE CHAINE"), ('towing', 'Remorque', 'chain_bridle'))
        self.assertEqual(register.classify('Remorque', 'CABLE DE TREUIL'), ('towing', 'Remorque', 'winch_wire'))
        self.assertEqual(register.classify(None, 'GRAPPIN (PETIT MODÈLE)'), ('lifting', 'Grappins', None))
        with self.assertRaisesRegex(ValueError, 'requires review'):
            register.classify('Remorque', 'UNKNOWN EQUIPMENT')

    def test_sql_literals_escape_quotes_and_do_not_update_inspections(self):
        row = self.row(**{'Titre': "A'; DROP TABLE inventory; --"})
        sql = register.import_sql(register.prepare_rows([(2, row)], 'register.xlsx', 'hash'), "company'quoted")
        self.assertIn("company''quoted", sql)
        self.assertIn("A''; DROP TABLE inventory; --", sql)
        self.assertNotIn('update public.lifting_inspection', sql)
        self.assertNotIn('insert into public.lifting_inspection', sql)


if __name__ == '__main__':
    unittest.main()
